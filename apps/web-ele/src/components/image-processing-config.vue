<script setup lang="ts">
import {
  computed,
  onActivated,
  onDeactivated,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';

import {
  ElAlert,
  ElButton,
  ElForm,
  ElFormItem,
  ElLink,
  ElMessage,
  ElRadio,
  ElRadioGroup,
} from 'element-plus';

import { requestClient } from '#/api/request';
import CopyValue from '#/components/copy-value.vue';

type Form = {
  enhance_device: 'cpu' | 'gpu';
  watermark_device: 'auto' | 'cpu' | 'cuda';
  watermark_engine: 'lama' | 'opencv';
  watermark_execution: 'local' | 'worker';
};
type Status = Partial<Form> & { storage_ready: boolean };
type CheckItem = {
  install_command?: string;
  install_hint?: string;
  install_url?: string;
  message: string;
  ready: boolean | null;
  scope?: string;
};
type Checks = {
  watermark: CheckItem;
  enhance: CheckItem;
  compress: CheckItem;
  ocr: CheckItem;
};
const props = defineProps<{ active: boolean; disabled?: boolean }>();
const form = reactive<Form>({
  enhance_device: 'gpu',
  watermark_device: 'auto',
  watermark_engine: 'lama',
  watermark_execution: 'local',
});
const status = ref<Status>();
const result = ref<Checks>();
const checkedForm = ref<Form>();
const loading = ref(false);
const saving = ref(false);
const checking = ref(false);
const pageActive = ref(true);
const checkError = ref('');
const errorMessage = ref('');
const busy = computed(() => props.disabled || loading.value || saving.value);
const watermarkTargetChanged = computed(() => {
  const checked = checkedForm.value;
  return (
    !!checked &&
    (form.watermark_engine !== checked.watermark_engine ||
      form.watermark_execution !== checked.watermark_execution)
  );
});
const watermarkCheckStale = computed(
  () =>
    watermarkTargetChanged.value ||
    (!!checkedForm.value &&
      form.watermark_engine === 'lama' &&
      form.watermark_device !== checkedForm.value.watermark_device),
);
const watermarkInstallGuide = computed(() => {
  const watermark = result.value?.watermark;
  if (!watermarkTargetChanged.value && watermark?.ready === false) {
    return watermark;
  }
});
const enhanceCheckStale = computed(
  () =>
    !!checkedForm.value &&
    form.enhance_device !== checkedForm.value.enhance_device,
);
const enhanceInstallGuide = computed(() => {
  const enhance = result.value?.enhance;
  if (!enhanceCheckStale.value && enhance?.ready === false) {
    return enhance;
  }
});
function apply(value: Status) {
  status.value = value;
  form.enhance_device = value.enhance_device ?? 'gpu';
  form.watermark_device = value.watermark_device ?? 'auto';
  form.watermark_engine = value.watermark_engine ?? 'lama';
  form.watermark_execution = value.watermark_execution ?? 'local';
}
async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    apply(await requestClient.get<Status>('/system/image-processing-config'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载失败';
  } finally {
    loading.value = false;
  }
}
async function save() {
  if (busy.value || !status.value?.storage_ready) return;
  saving.value = true;
  errorMessage.value = '';
  try {
    apply(
      await requestClient.put<Status>('/system/image-processing-config', {
        ...form,
      }),
    );
    ElMessage.success('图片处理配置已保存，新请求生效');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败';
  } finally {
    saving.value = false;
  }
}
watch(
  [
    () => pageActive.value && props.active && !!status.value && !loading.value,
    () => form.watermark_execution,
    () => form.watermark_engine,
    () => form.watermark_device,
    () => form.enhance_device,
  ],
  async ([shouldCheck], _, onCleanup) => {
    checking.value = shouldCheck;
    if (!shouldCheck) return;

    const selection = { ...form };
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    checkError.value = '';
    try {
      const response = await requestClient.post<Checks>(
        '/system/image-processing-config/check',
        selection,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      result.value = response;
      checkedForm.value = selection;
    } catch (error) {
      if (!controller.signal.aborted) {
        checkError.value = error instanceof Error ? error.message : '检查失败';
      }
    } finally {
      if (!controller.signal.aborted) checking.value = false;
    }
  },
);
function checkLabel(item: CheckItem) {
  if (item.ready === null) return '未验证远程环境';
  return item.ready ? '检查通过' : '未就绪';
}
onMounted(load);
onActivated(() => {
  pageActive.value = true;
});
onDeactivated(() => {
  pageActive.value = false;
});
</script>
<template>
  <div v-loading="loading">
    <ElAlert
      v-if="errorMessage || checkError"
      :title="errorMessage || checkError"
      type="error"
      :closable="false"
      class="mb-4"
    />
    <ElAlert
      v-if="status && !status.storage_ready"
      title="请先完成后端 AI 服务配置表迁移，再保存图片处理配置。"
      type="warning"
      :closable="false"
      class="mb-4"
    />
    <p class="help">
      集中管理图片去水印、图片高清、图片压缩和图片文字识别。当前使用本地处理能力，未接入图片云端
      API，也不读取视频供应商或 VLM 配置。
    </p>
    <p class="help" aria-live="polite">
      {{
        checking
          ? '正在自动检查运行环境…'
          : '进入图片处理或切换选项时，自动检查当前后端的依赖和模型文件。远程节点需在执行机器验证。'
      }}
    </p>
    <ElForm label-position="top" :disabled="busy">
      <div class="cards">
        <section>
          <h3>图片去水印</h3>
          <ElFormItem label="修复引擎">
            <ElRadioGroup v-model="form.watermark_engine">
              <ElRadio value="lama">LaMa · 模型修复</ElRadio>
              <ElRadio value="opencv">OpenCV · CPU 修复</ElRadio>
            </ElRadioGroup>
          </ElFormItem>
          <ElFormItem label="执行位置">
            <ElRadioGroup v-model="form.watermark_execution">
              <ElRadio value="local">local · 本机处理</ElRadio>
              <ElRadio value="worker">worker · 远程工作节点</ElRadio>
            </ElRadioGroup>
          </ElFormItem>
          <template v-if="form.watermark_engine === 'lama'">
            <ElFormItem label="LaMa 运行设备">
              <ElRadioGroup v-model="form.watermark_device">
                <ElRadio value="auto">自动</ElRadio>
                <ElRadio value="cpu">CPU</ElRadio>
                <ElRadio value="cuda">CUDA GPU</ElRadio>
              </ElRadioGroup>
            </ElFormItem>
            <p class="help">
              请在实际执行的机器上安装 LaMa。自动模式优先使用 CUDA GPU，CUDA
              不可用时使用 CPU。指定 CUDA GPU 时，执行机器须支持 CUDA。
            </p>
          </template>
          <p class="help">
            从后台数据库读取，保存后新请求生效，无需重启。Worker
            需在线并支持图片修复任务；已开始的请求继续使用原执行位置。
          </p>
          <ElAlert
            v-if="result"
            :title="`${watermarkCheckStale ? '上次检查 · ' : ''}${checkLabel(result.watermark)}：${result.watermark.message}`"
            :type="
              watermarkCheckStale
                ? 'info'
                : result.watermark.ready
                  ? 'success'
                  : 'warning'
            "
            :closable="false"
          />
          <div v-if="watermarkInstallGuide" class="install-guide">
            <p v-if="watermarkInstallGuide.install_hint" class="help">
              {{ watermarkInstallGuide.install_hint }}
            </p>
            <template v-if="watermarkInstallGuide.install_command">
              <CopyValue
                :value="watermarkInstallGuide.install_command"
                label="复制安装命令"
              >
                {{ watermarkCheckStale ? '上次检查的安装命令' : '安装命令' }}
              </CopyValue>
              <pre>{{ watermarkInstallGuide.install_command }}</pre>
            </template>
            <ElLink
              v-if="watermarkInstallGuide.install_url"
              :href="watermarkInstallGuide.install_url"
              target="_blank"
              rel="noopener noreferrer"
              type="primary"
            >
              查看安装说明
            </ElLink>
          </div>
        </section>
        <section>
          <h3>图片高清</h3>
          <p class="help">
            使用 Real-ESRGAN 在服务器本机处理，输出 2 倍尺寸图片。
          </p>
          <ElFormItem label="Real-ESRGAN 运行设备">
            <ElRadioGroup v-model="form.enhance_device">
              <ElRadio value="gpu">GPU · Vulkan</ElRadio>
              <ElRadio value="cpu">CPU</ElRadio>
            </ElRadioGroup>
          </ElFormItem>
          <p class="help">
            无 GPU 的服务器可选
            CPU。两种设备使用各自的运行环境，保存后新请求生效。
          </p>
          <ElAlert
            v-if="result"
            :title="`${enhanceCheckStale ? '上次检查 · ' : ''}${checkLabel(result.enhance)}：${result.enhance.message}`"
            :type="
              enhanceCheckStale
                ? 'info'
                : result.enhance.ready
                  ? 'success'
                  : 'warning'
            "
            :closable="false"
          />
          <div v-if="enhanceInstallGuide" class="install-guide">
            <p v-if="enhanceInstallGuide.install_hint" class="help">
              {{ enhanceInstallGuide.install_hint }}
            </p>
            <template v-if="enhanceInstallGuide.install_command">
              <CopyValue
                :value="enhanceInstallGuide.install_command"
                label="复制安装命令"
              >
                安装命令
              </CopyValue>
              <pre>{{ enhanceInstallGuide.install_command }}</pre>
            </template>
            <ElLink
              v-if="enhanceInstallGuide.install_url"
              :href="enhanceInstallGuide.install_url"
              target="_blank"
              rel="noopener noreferrer"
              type="primary"
            >
              查看安装说明
            </ElLink>
          </div>
        </section>
        <section>
          <h3>图片压缩</h3>
          <p class="help">
            使用服务器本机 Pillow 图像编码处理，不需要 AI 模型，也不调用云端
            API。压缩尺寸和质量沿用现有业务参数。
          </p>
          <ElAlert
            v-if="result"
            :title="`${checkLabel(result.compress)}：${result.compress.message}`"
            :type="result.compress.ready ? 'success' : 'warning'"
            :closable="false"
          />
        </section>
        <section>
          <h3>图片文字识别</h3>
          <p class="help">
            使用服务器本机 RapidOCR。当前不调用 VLM 或云端
            OCR；需准备依赖与识别模型。
          </p>
          <ElAlert
            v-if="result"
            :title="`${checkLabel(result.ocr)}：${result.ocr.message}`"
            :type="result.ocr.ready ? 'success' : 'warning'"
            :closable="false"
          />
        </section>
      </div>
      <ElButton
        type="primary"
        :loading="saving"
        :disabled="!status?.storage_ready"
        @click="save"
      >
        保存图片处理配置
      </ElButton>
    </ElForm>
  </div>
</template>
<style scoped>
.help {
  margin: 6px 0 16px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.install-guide {
  margin-top: 12px;
  font-size: 13px;
}

.install-guide .help {
  margin-bottom: 8px;
}

.install-guide pre {
  padding: 8px 10px;
  margin: 4px 0 8px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

section {
  padding: 18px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}

h3 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
}
</style>
