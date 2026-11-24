<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ElAlert,
  ElButton,
  ElDialog,
  ElImage,
  ElTabPane,
  ElTabs,
} from 'element-plus';
import { requestClient } from '#/api/request';
import CopyValue from '#/components/copy-value.vue';

type RichNode = {
  name?: string;
  type?: string;
  text?: string;
  attrs?: Record<string, string>;
  children?: RichNode[];
};
type ParseResult = {
  type?: string;
  title?: string;
  videoUrls?: string[];
  imageUrls?: string[];
  imageDownloadUrls?: string[];
  articleText?: string;
  articleHtml?: string;
  articleMarkdown?: string;
  articleNodes?: RichNode[];
  watermarkUrl?: string;
};

const props = defineProps<{ modelValue: boolean; shareText: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});
const loading = ref(false);
const error = ref('');
const result = ref<ParseResult | null>(null);
const activeTab = ref('video');
const previewIndex = ref<number | null>(null);

const videos = computed(() => result.value?.videoUrls || []);
const images = computed(() => result.value?.imageUrls || []);
const hasArticle = computed(
  () => !!(result.value?.articleText || result.value?.title),
);
const isRichArticle = computed(() => result.value?.type === 'images' && !!result.value?.articleText);


function nodeToHtml(node: RichNode): string {
  if (node.type === 'text') return escapeHtml(node.text || '');
  const name = (node.name || '').toLowerCase();
  if (!name) return escapeHtml(node.text || '');
  const attrs = Object.entries(node.attrs || {})
    .filter(([key]) => !['src'].includes(key))
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(' ');
  const src = node.attrs?.src || '';
  if (name === 'img') return `<img src="${escapeHtml(src)}" style="max-width:100%" />`;
  const inner = (node.children || []).map(nodeToHtml).join('');
  return `<${name}${attrs ? ` ${attrs}` : ''}>${inner}</${name}>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const richHtml = computed(() => {
  const r = result.value;
  if (!r) return '';
  const expand = (value: string) =>
    value.replace(/\{\{IMG_(\d+)\}\}/g, (_m, i: string) => images.value[Number(i)] || '');
  if (r.articleNodes?.length) return r.articleNodes.map(nodeToHtml).join('');
  if (r.articleHtml) return expand(r.articleHtml);
  return '';
});

async function run() {
  if (!props.shareText) return;
  loading.value = true;
  error.value = '';
  result.value = null;
  try {
    const data = await requestClient.post<ParseResult>('/operations/parse-test', {
      url: props.shareText,
    });
    result.value = data;
    activeTab.value = videos.value.length ? 'video' : images.value.length ? 'image' : 'article';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '解析失败，请重试';
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.modelValue,
  (value) => {
    if (value) void run();
  },
);
</script>

<template>
  <ElDialog
    v-model="open"
    title="测试解析（不存数据，仅预览结果）"
    width="min(1100px,96vw)"
    append-to-body
    destroy-on-close
    class="parse-test-dialog"
  >
    <div class="mb-3">
      <CopyValue :value="shareText" label="复制原始分享内容" />
    </div>
    <ElAlert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      class="mb-3 whitespace-pre-wrap"
    />
    <div v-else-if="loading" class="py-16 text-center text-gray-500">正在解析，请稍候…</div>
    <template v-else-if="result">
      <ElAlert
        title="测试解析复用手机端同一套解析逻辑，播放与下载均直连源站直链，不经过服务器转发、不落盘、不记账、不与用户关联。链接为短时地址，过期后请重新解析。"
        type="info"
        :closable="false"
        class="mb-3"
      />
      <ElTabs v-model="activeTab">
        <ElTabPane v-if="videos.length" label="视频" name="video">
          <div v-for="(src, i) in videos" :key="i" class="mb-5">
            <div class="mb-2 flex items-center justify-between gap-2">
              <span class="text-sm text-gray-500">视频 {{ i + 1 }}/{{ videos.length }}</span>
              <CopyValue :value="src" label="复制播放链接" />
            </div>
            <video
              :src="src"
              controls
              playsinline
              preload="metadata"
              class="w-full rounded bg-black"
              style="max-height: 70vh"
            />
          </div>
        </ElTabPane>
        <ElTabPane v-if="images.length" label="图集" name="image">
          <div class="image-grid">
            <ElImage
              v-for="(src, i) in images"
              :key="i"
              :src="src"
              :preview-src-list="images"
              :initial-index="i"
              preview-teleported
              fit="cover"
              class="image-tile"
            />
          </div>
        </ElTabPane>
        <ElTabPane v-if="hasArticle" :label="isRichArticle ? '正文' : '文案'" name="article">
          <div v-if="result.title" class="article-title">{{ result.title }}</div>
          <div v-if="richHtml" class="article-body" v-html="richHtml" />
          <pre v-else class="article-body whitespace-pre-wrap font-sans">{{ result.articleText || result.title }}</pre>
          <div class="mt-3 flex flex-wrap gap-2">
            <CopyValue
              :value="result.articleMarkdown || result.articleText || result.title || ''"
              :label="isRichArticle ? '复制正文 Markdown' : '复制文案'"
            />
          </div>
        </ElTabPane>
      </ElTabs>
      <div v-if="!videos.length && !images.length && !hasArticle" class="py-10 text-center text-gray-500">
        未解析到可展示的视频、图集或文案
      </div>
    </template>
    <template #footer>
      <ElButton @click="open = false">关闭</ElButton>
      <ElButton type="primary" :loading="loading" @click="run">重新解析</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.article-title {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.5;
  margin-bottom: 16px;
}
.article-body {
  font-size: 15px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.article-body :deep(img) {
  max-width: 100%;
  height: auto;
}
.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.image-tile {
  width: 100%;
  height: 180px;
  border-radius: 8px;
  background: #0f0f0f22;
  cursor: zoom-in;
}
</style>
