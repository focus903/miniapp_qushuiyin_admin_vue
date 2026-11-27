<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { ElAlert, ElButton } from 'element-plus';

import { requestClient } from '#/api/request';
import CopyValue from '#/components/copy-value.vue';
import HevcVideo from '#/components/hevc-video.vue';
import { sniffMp4Codec } from '#/utils/mp4-codec';
const props = defineProps<{ resource: string; recordId: number | string }>();
type Preview = {
  input_url: string;
  result_url: string;
  input_path?: string;
  result_path?: string;
  input_codec?: string;
  result_codec?: string;
  input_reason: string;
  result_reason: string;
  media_expires: number;
  cloud?: boolean;
  input_cloud_url?: string;
  result_cloud_url?: string;
};
const busy = ref(false);
const loadError = ref('');
const inputFailed = ref(false);
const resultFailed = ref(false);
const value = ref<null | Preview>(null);
const inputCodec = ref('');
const resultCodec = ref('');
const hasResult = computed(() =>
  ['subtitle', 'watermark'].includes(props.resource),
);
let active = true;
let version = 0;
function mediaUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    // 后端返回的是对外绝对地址（publicBaseUrl），与后台页面不同源；带 credentials 的 video 在无 CORS 头时会被浏览器拦截，
    // 且 cookie 绑定到后端域名。统一改走页面同源的 /admin-api 代理路径。
    return parsed.pathname + parsed.search;
  } catch {
    return '';
  }
}
function fullUrl(url: string) {
  if (!url) return '';
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}
function knownCodec(label?: string) {
  return Boolean(label && /(HEVC|H\.264|H\.265|AVC|AV1|VP8|VP9|MPEG-\d)/i.test(label));
}

async function sniffCodecs(data: Preview, current: number) {
  inputCodec.value = data.input_codec || '';
  resultCodec.value = data.result_codec || '';
  const jobs: Promise<void>[] = [];
  if (!knownCodec(data.input_codec) && data.input_cloud_url) {
    jobs.push(
      sniffMp4Codec(data.input_cloud_url).then((label) => {
        if (current === version && active && label) inputCodec.value = label;
      }),
    );
  }
  if (!knownCodec(data.result_codec) && data.result_cloud_url) {
    jobs.push(
      sniffMp4Codec(data.result_cloud_url).then((label) => {
        if (current === version && active && label) resultCodec.value = label;
      }),
    );
  }
  await Promise.all(jobs);
}

async function load() {
  const current = ++version;
  value.value = null;
  inputCodec.value = '';
  resultCodec.value = '';
  loadError.value = '';
  busy.value = true;
  inputFailed.value = false;
  resultFailed.value = false;
  try {
    const data = await requestClient.post<Preview>(
      `/operations/records/${props.resource}/${encodeURIComponent(String(props.recordId))}/preview`,
      {},
    );
    if (current === version && active)
      value.value = {
        ...data,
        input_url: mediaUrl(data.input_url),
        result_url: mediaUrl(data.result_url),
        input_path: data.input_path || '',
        result_path: data.result_path || '',
      };
      void sniffCodecs(data, current);
  } catch (error) {
    if (current === version && active)
      loadError.value =
        error instanceof Error ? error.message : '视频预览加载失败';
  } finally {
    if (current === version && active) busy.value = false;
  }
}
watch(
  () => [props.resource, props.recordId],
  () => void load(),
  { immediate: true },
);
onBeforeUnmount(() => {
  active = false;
  version++;
  value.value = null;
});
</script>
<template>
  <section v-loading="busy" class="my-4">
    <div class="mb-3 flex items-center justify-between">
      <strong>视频预览</strong><ElButton size="small" :loading="busy" @click="load">
        重新加载预览
      </ElButton>
    </div>
    <ElAlert
      v-if="loadError"
      :title="loadError"
      type="error"
      :closable="false"
    />
    <ElAlert
      v-if="value?.cloud"
      title="本记录为云端直传：上方「链接地址」是后台代理入口，需管理员登录、稳定不过期；下方「云存储直链」是对象存储的原始地址，可直接打开或复制，公开桶谁拿到都能访问，请勿随意外发。「存储位置」是桶内对象 key。"
      type="info"
      :closable="false"
      class="mb-3"
    />
    <ElAlert
      v-else-if="value"
      title="本记录为上传到服务器：视频文件保存在服务器本地，「链接地址」是后台代理入口，需管理员登录；无云存储直链。「存储位置」是服务器上的相对路径。"
      type="info"
      :closable="false"
      class="mb-3"
    />
    <div
      v-if="value"
      class="video-grid"
      :class="{ 'single-video': !hasResult }"
    >
      <section>
        <h4>原视频</h4>
        <p v-if="inputCodec" class="codec-line">
          编码格式：{{ inputCodec }}
        </p>
        <HevcVideo
          v-if="value.input_url && !inputFailed"
          :src="value.input_url"
          :codec="inputCodec"
        />
        <p v-else>
          {{
            inputFailed
              ? '播放失败，请重新加载预览；浏览器可能不支持此视频格式'
              : value.input_reason
          }}
        </p>
        <div v-if="value.input_url" class="path-line">
          <span class="path-label">链接地址</span><CopyValue :value="fullUrl(value.input_url)" label="复制原视频链接">
            <span class="path-text" :title="fullUrl(value.input_url)">{{
              fullUrl(value.input_url)
            }}</span>
          </CopyValue>
        </div>
        <div v-if="value.input_path" class="path-line">
          <span class="path-label">存储位置</span><CopyValue :value="value.input_path" label="复制原视频路径或对象 key">
            <span class="path-text" :title="value.input_path">{{
              value.input_path
            }}</span>
          </CopyValue>
        </div>
        <div v-if="value.input_cloud_url" class="path-line">
          <span class="path-label">云存储直链</span><CopyValue :value="value.input_cloud_url" label="复制原视频云存储直链">
            <span class="path-text" :title="value.input_cloud_url">{{
              value.input_cloud_url
            }}</span>
          </CopyValue>
        </div>
      </section>
      <section v-if="hasResult">
        <h4>处理结果</h4>
        <p v-if="resultCodec" class="codec-line">
          编码格式：{{ resultCodec }}
        </p>
        <HevcVideo
          v-if="value.result_url && !resultFailed"
          :src="value.result_url"
          :codec="resultCodec"
        />
        <p v-else>
          {{ resultFailed ? '播放失败，请重新加载预览' : value.result_reason }}
        </p>
        <div v-if="value.result_url" class="path-line">
          <span class="path-label">链接地址</span><CopyValue
            :value="fullUrl(value.result_url)"
            label="复制处理结果链接"
          >
            <span class="path-text" :title="fullUrl(value.result_url)">{{
              fullUrl(value.result_url)
            }}</span>
          </CopyValue>
        </div>
        <div v-if="value.result_path" class="path-line">
          <span class="path-label">存储位置</span><CopyValue :value="value.result_path" label="复制处理结果路径或对象 key">
            <span class="path-text" :title="value.result_path">{{
              value.result_path
            }}</span>
          </CopyValue>
        </div>
        <div v-if="value.result_cloud_url" class="path-line">
          <span class="path-label">云存储直链</span><CopyValue :value="value.result_cloud_url" label="复制处理结果云存储直链">
            <span class="path-text" :title="value.result_cloud_url">{{
              value.result_cloud_url
            }}</span>
          </CopyValue>
        </div>
      </section>
    </div>
    <p v-if="value?.media_expires" class="mt-2 text-xs text-gray-500">
      素材保留至：{{
        new Date(value.media_expires * 1000).toLocaleString('zh-CN')
      }}；过期或删除后不可播放。
    </p>
  </section>
</template>
<style scoped>
.video-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.single-video {
  grid-template-columns: 1fr;
}

.video-grid h4 {
  margin-bottom: 8px;
  font-weight: 600;
}

.codec-line {
  margin: -2px 0 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.video-grid :deep(.hevc-video) {
  width: 100%;
}

.video-grid video {
  width: 100%;
  max-height: 50vh;
  background: #111;
  border-radius: 6px;
}

.video-grid p {
  padding: 24px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}

.path-line {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.path-label {
  flex: none;
}

.path-line > :deep(.copy-value) {
  display: inline-flex;
  flex: 1;
  align-items: center;
  min-width: 0;
  white-space: nowrap;
}

.path-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .video-grid {
    grid-template-columns: 1fr;
  }
}
</style>
