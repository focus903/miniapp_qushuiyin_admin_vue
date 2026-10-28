<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
} from 'element-plus';

import { requestClient } from '#/api/request';
type Kind = 'llm' | 'vlm';
type Form = {
  provider: string;
  base_url: string;
  model: string;
  api_key: string;
  timeout_seconds: number;
  temperature?: number;
};
type Status = Form & {
  configured: boolean;
  storage_ready: boolean;
  encryption_key_file: string;
};
type Probe = { ok: boolean; message: string };
type Preset = { key: string; label: string; url: string; models: string[] };
const props = defineProps<{ kind: Kind; disabled?: boolean }>();
const presets: Record<Kind, Preset[]> = {
  llm: [
    {
      key: 'dashscope',
      label: 'DashScope 阿里云',
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    },
    {
      key: 'stepfun',
      label: '阶跃星辰 StepFun',
      url: 'https://api.stepfun.com/step_plan/v1',
      models: ['step-3.7-flash', 'step-5-preview', 'step-3.5-flash'],
    },
    {
      key: 'deepseek',
      label: 'DeepSeek',
      url: 'https://api.deepseek.com/v1',
      models: ['deepseek-chat', 'deepseek-reasoner'],
    },
    {
      key: 'ark',
      label: '火山方舟',
      url: 'https://ark.cn-beijing.volces.com/api/v3',
      models: ['doubao-seed-1-6-flash-250828'],
    },
    {
      key: 'openai',
      label: 'OpenAI',
      url: 'https://api.openai.com/v1',
      models: ['gpt-4o', 'gpt-4o-mini'],
    },
  ],
  vlm: [
    {
      key: 'dashscope',
      label: 'DashScope 阿里云',
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: ['qwen3-vl-plus', 'qwen3-vl-flash'],
    },
    {
      key: 'stepfun',
      label: '阶跃星辰 StepFun',
      url: 'https://api.stepfun.com/step_plan/v1',
      models: ['step-3.7-flash', 'step-5-preview'],
    },
    {
      key: 'ark',
      label: '火山方舟',
      url: 'https://ark.cn-beijing.volces.com/api/v3',
      models: ['doubao-seed-1-6-flash-250828'],
    },
    {
      key: 'openai',
      label: 'OpenAI',
      url: 'https://api.openai.com/v1',
      models: ['gpt-4o'],
    },
  ],
};
const label = computed(() => props.kind.toUpperCase());
const form = reactive<Form>({
  provider: 'dashscope',
  base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: props.kind === 'llm' ? 'qwen-max' : 'qwen3-vl-plus',
  api_key: '',
  timeout_seconds: 120,
  ...(props.kind === 'llm' ? { temperature: 0.4 } : {}),
});
const status = ref<Status>();
const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const errorMessage = ref('');
const result = ref<null | Probe>(null);
const busy = computed(
  () => props.disabled || loading.value || saving.value || testing.value,
);
const currentPreset = computed(() =>
  presets[props.kind].find(
    (item) => item.url === form.base_url.replace(/\/$/, ''),
  ),
);
function payload(): Form {
  return {
    provider: currentPreset.value?.key || 'custom',
    base_url: form.base_url,
    model: form.model,
    api_key: form.api_key,
    timeout_seconds: form.timeout_seconds,
    ...(props.kind === 'llm' ? { temperature: form.temperature } : {}),
  };
}
function apply(value: Status) {
  status.value = value;
  for (const key of Object.keys(payload()) as (keyof Form)[])
    Object.assign(form, { [key]: value[key] });
}
function selectProvider(preset?: Preset) {
  if (busy.value) return;
  if (preset) {
    form.provider = preset.key;
    form.base_url = preset.url;
    form.model = preset.models[0] ?? '';
  } else {
    form.provider = 'custom';
    form.base_url = '';
    form.model = '';
  }
  form.api_key = '';
}
async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    apply(await requestClient.get<Status>(`/system/ai-config/${props.kind}`));
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '配置加载失败';
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
      await requestClient.put<Status>(
        `/system/ai-config/${props.kind}`,
        payload(),
      ),
    );
    ElMessage.success(`${label.value} 配置已保存`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败';
  } finally {
    saving.value = false;
  }
}
async function probe() {
  if (busy.value || !status.value) return;
  testing.value = true;
  errorMessage.value = '';
  result.value = null;
  try {
    result.value = await requestClient.post<Probe>(
      `/system/ai-config/${props.kind}/test`,
      payload(),
      { timeout: 30_000 },
    );
  } catch (error) {
    result.value = {
      ok: false,
      message: error instanceof Error ? error.message : '连通性测试失败',
    };
  } finally {
    testing.value = false;
  }
}
watch(form, () => {
  result.value = null;
});
onMounted(load);
</script>
<template>
  <ElForm v-loading="loading" label-position="top" :disabled="busy">
    <p v-if="kind === 'llm'" class="help">
      LLM：大语言模型（Large Language
      Model）。作用：理解和整理文字，用于文案总结、改写与内容生成。
    </p>
    <p v-else class="help">
      VLM：视觉语言模型（Vision-Language
      Model）。作用：理解图片与视频关键帧，描述画面、识别文字并分析图表。
    </p>
    <ElAlert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      :closable="false"
      class="mb-4"
    />
    <ElAlert
      v-if="status && !status.storage_ready"
      title="请先执行后端数据库迁移，再保存 AI 服务配置。"
      type="warning"
      :closable="false"
      class="mb-4"
    />
    <ElFormItem label="快速选择供应商">
      <div class="chips">
        <ElButton
          v-for="preset in presets[kind]"
          :key="preset.key"
          round
          :type="currentPreset?.key === preset.key ? 'primary' : 'default'"
          @click="selectProvider(preset)"
        >
          {{ preset.label }}
</ElButton><ElButton
          round
          :type="!currentPreset ? 'primary' : 'default'"
          @click="selectProvider()"
        >
          自定义
        </ElButton>
      </div>
    </ElFormItem>
    <ElFormItem label="API Key">
      <ElInput
        v-model="form.api_key"
        :type="form.api_key === '************' ? 'text' : 'password'"
        :show-password="form.api_key !== '************'"
        placeholder="未配置"
        autocomplete="new-password"
        maxlength="2048"
      />
      <p class="help">
        已保存仅显示 ************，保留 ************ 或留空不更换原
        Key。切换接口地址时请填写对应供应商的新 Key。
      </p>
      <p class="help">
        密钥加密存入数据库；加解密文件首次保存时自动生成，位置：<code>{{
          status?.encryption_key_file || '后端项目/storage/secrets/asr.key'
        }}</code>。与 ASR 共用，请单独备份，迁移时一起保留。
      </p>
    </ElFormItem>
    <div class="fields">
      <ElFormItem label="接口地址（Base URL）">
        <ElInput
          v-model="form.base_url"
          placeholder="https://供应商域名/v1"
          maxlength="2048"
        />
        <p class="help">
          使用供应商的公网 HTTPS OpenAI 兼容地址，不含
          /chat/completions。地域和业务空间需与 Key 一致。
        </p>
      </ElFormItem>
      <ElFormItem label="模型名称">
        <ElInput v-model="form.model" maxlength="200" />
        <div class="chips mt-2">
          <ElButton
            v-for="model in currentPreset?.models || []"
            :key="model"
            size="small"
            round
            :type="form.model === model ? 'primary' : 'default'"
            @click="form.model = model"
          >
            {{ model }}
          </ElButton>
        </div>
        <div
          v-if="kind === 'vlm' && currentPreset?.key === 'dashscope'"
          class="help"
        >
          <p>Plus：侧重复杂视觉理解与推理，适合复杂图表、密集文字等内容。</p>
          <p>Flash：侧重响应速度，适合日常画面识别与快速描述。</p>
        </div>
      </ElFormItem>
      <ElFormItem label="请求超时（秒）">
        <ElInputNumber
          v-model="form.timeout_seconds"
          :min="10"
          :max="300"
          :precision="0"
        />
      </ElFormItem>
      <ElFormItem v-if="kind === 'llm'" label="生成温度（Temperature）">
        <ElInputNumber
          v-model="form.temperature"
          :min="0"
          :max="2"
          :step="0.1"
          :precision="1"
        />
        <p class="help">
          较低更稳定，较高更多样；默认 0.4，具体支持范围以所用模型为准。
        </p>
      </ElFormItem>
    </div>
    <ElButton :loading="testing" :disabled="!status" @click="probe">
      测试 {{ label }} 连通性
    </ElButton>
    <p class="help">
      使用当前表单测试，不自动保存。LLM 发送简短文字，VLM
      发送内置测试图片；供应商可能计费，不扣用户积分。
    </p>
    <ElAlert
      v-if="result"
      :title="result.message"
      :type="result.ok ? 'success' : 'error'"
      :closable="false"
      class="mb-4"
    />
    <ElButton
      type="primary"
      :loading="saving"
      :disabled="!status?.storage_ready"
      @click="save"
    >
      保存 {{ label }} 配置
    </ElButton>
  </ElForm>
</template>
<style scoped>
.help {
  width: 100%;
  margin: 6px 0 16px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chips :deep(.el-button) {
  margin-left: 0;
}

.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0 24px;
}

code {
  overflow-wrap: anywhere;
}
</style>
