<script setup lang="ts">
import type { ConfigField, ConfigValues } from '#/utils/app-config-layout';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElOption,
  ElRadio,
  ElRadioGroup,
  ElSelect,
} from 'element-plus';

import { requestClient } from '#/api/request';

type Mode = 'cloud' | 'local';
type LocalEngine = 'paraformer' | 'whisper';
type Form = {
  mode: Mode;
  local_execution: 'local' | 'worker';
  local_engine: LocalEngine;
  provider: string;
  region: string;
  model: string;
  timeout_seconds: number;
  api_key: string;
};
type Installation = {
  models_directory: string;
  download_command_template: string;
  windows_download_command_template: string;
  execution: 'local' | 'worker';
  note?: string;
  paraformer_directory?: string;
  paraformer_install_command?: string;
  paraformer_check_command?: string;
  paraformer_note?: string;
};
type Status = Form & {
  id: string;
  configured: boolean;
  storage_ready: boolean;
  encryption_ready: boolean;
  encryption_key_file?: string;
  local_values?: ConfigValues;
  local_fields?: ConfigField[];
  provider_configs?: Record<string, Partial<Form> & { configured?: boolean }>;
  local_installation?: Installation;
};
type LocalCheck = {
  ready: boolean;
  dependencies_ready: boolean;
  missing_models: string[];
  model_directory: string;
  execution: string;
  message: string;
};
type Probe = {
  ok: boolean;
  message: string;
  model: string;
  elapsed_ms: number;
};
const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ modeChange: [mode: Mode] }>();
const form = reactive<Form>({
  mode: 'local',
  local_execution: 'local',
  local_engine: 'whisper',
  provider: 'dashscope',
  region: 'cn-beijing',
  model: 'fun-asr-realtime',
  timeout_seconds: 120,
  api_key: '',
});
const providers = [
  {
    key: 'dashscope',
    label: 'DashScope（阿里云）',
    region: 'cn-beijing',
    model: 'fun-asr-realtime',
  },
  {
    key: 'stepfun',
    label: '阶跃星辰 StepFun',
    region: 'step-plan',
    model: 'stepaudio-2.5-asr',
  },
];
const providerDrafts = reactive<Record<string, Form>>({});
const status = ref<Status>();
const localValues = reactive<ConfigValues>({});
const localFields = ref<ConfigField[]>([]);
const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const errorMessage = ref('');
const testResult = ref<null | Probe>(null);
const localChecking = ref(false);
const localCheckResult = ref<LocalCheck | null>(null);
const busy = computed(
  () =>
    props.disabled ||
    loading.value ||
    saving.value ||
    testing.value ||
    localChecking.value,
);
const selectedProvider = computed(
  () =>
    providers.find((item) => item.key === form.provider) || {
      key: 'dashscope',
      label: 'DashScope（阿里云）',
      model: 'fun-asr-realtime',
      region: 'cn-beijing',
    },
);
const currentLocalModel = computed(() =>
  typeof localValues.whisperModel === 'string'
    ? localValues.whisperModel
    : 'small',
);
const downloadCommand = computed(() =>
  (
    status.value?.local_installation?.download_command_template ||
    '.venv/bin/python download_model.py --model {model}'
  ).replace('{model}', currentLocalModel.value),
);
const windowsDownloadCommand = computed(() =>
  (
    status.value?.local_installation?.windows_download_command_template ||
    String.raw`.\.venv\Scripts\python.exe download_model.py --model {model}`
  ).replace('{model}', currentLocalModel.value),
);
function providerDefault(key: string): Form {
  const preset = providers.find((item) => item.key === key) || {
    key: 'dashscope',
    label: 'DashScope（阿里云）',
    model: 'fun-asr-realtime',
    region: 'cn-beijing',
  };
  return {
    mode: 'cloud',
    local_execution: 'local',
    local_engine: 'whisper',
    provider: preset.key,
    region: preset.region,
    model: preset.model,
    timeout_seconds: 120,
    api_key: '',
  };
}
function selectProvider(key: string) {
  if (
    busy.value ||
    form.provider === key ||
    !providers.some((item) => item.key === key)
  )
    return;
  providerDrafts[form.provider] = { ...payload() };
  const mode = form.mode;
  const local_engine = form.local_engine;
  const local_execution = form.local_execution;
  Object.assign(form, providerDrafts[key] || providerDefault(key), {
    mode,
    local_engine,
    local_execution,
  });
  testResult.value = null;
}
function payload(): Form {
  return {
    mode: form.mode,
    local_execution: form.local_execution,
    local_engine: form.local_engine,
    provider: form.provider,
    region: form.region,
    model: form.model,
    timeout_seconds: form.timeout_seconds,
    api_key: form.api_key,
  };
}
function apply(value: Status, resetDrafts = false) {
  value = {
    ...value,
    local_execution:
      value.local_execution || value.local_installation?.execution || 'local',
    local_engine: value.local_engine || 'whisper',
  };
  status.value = value;
  Object.assign(localValues, value.local_values || {});
  localFields.value = value.local_fields || [];
  for (const preset of providers) {
    if (resetDrafts || !providerDrafts[preset.key])
      providerDrafts[preset.key] = {
        ...providerDefault(preset.key),
        ...value.provider_configs?.[preset.key],
      };
  }
  for (const key of Object.keys(payload()) as (keyof Form)[])
    Object.assign(form, { [key]: value[key] });
  providerDrafts[form.provider] = { ...payload() };
}
function selectLocalEngine(engine: LocalEngine) {
  if (busy.value || engine === form.local_engine) return;
  form.local_engine = engine;
  localCheckResult.value = null;
}
async function checkLocal() {
  if (
    localChecking.value ||
    loading.value ||
    saving.value ||
    testing.value ||
    form.local_engine !== 'paraformer'
  )
    return;
  localChecking.value = true;
  errorMessage.value = '';
  localCheckResult.value = null;
  try {
    localCheckResult.value = await requestClient.post<LocalCheck>(
      '/system/asr-config/local-check',
      { local_engine: form.local_engine },
    );
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '本地模型检查失败';
  } finally {
    localChecking.value = false;
  }
}
async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    apply(await requestClient.get<Status>('/system/asr-config'), true);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '语音识别配置加载失败';
  } finally {
    loading.value = false;
  }
}
async function save() {
  if (
    props.disabled ||
    saving.value ||
    testing.value ||
    !status.value?.storage_ready
  )
    return;
  saving.value = true;
  errorMessage.value = '';
  try {
    apply(
      await requestClient.put<Status>('/system/asr-config', {
        ...payload(),
        local_values: { ...localValues },
      }),
    );
    ElMessage.success('语音识别配置已保存，新任务生效');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败';
  } finally {
    saving.value = false;
  }
}
async function probe() {
  if (props.disabled || testing.value || saving.value || form.mode !== 'cloud')
    return;
  testing.value = true;
  errorMessage.value = '';
  testResult.value = null;
  try {
    testResult.value = await requestClient.post<Probe>(
      '/system/asr-config/test',
      payload(),
      { timeout: 30_000 },
    );
  } catch (error) {
    testResult.value = {
      ok: false,
      message: error instanceof Error ? error.message : '在线 ASR 测试失败',
      model: form.model,
      elapsed_ms: 0,
    };
  } finally {
    testing.value = false;
  }
}
watch(form, () => {
  testResult.value = null;
});
watch(
  () => form.mode,
  (value) => emit('modeChange', value),
  { immediate: true },
);
onMounted(load);
</script>

<template>
  <div v-loading="loading" class="asr-config">
    <p class="asr-help">
      ASR：自动语音识别（Automatic Speech
      Recognition）。作用：把视频里的讲话转换成文字。链接视频与上传视频共用此配置。
    </p>
    <ElAlert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="mb-4"
    />
    <ElAlert
      v-if="status && !status.storage_ready"
      title="请先执行后端数据库迁移，再保存语音识别配置。"
      type="warning"
      :closable="false"
      class="mb-4"
    />
    <ElFormItem label="语音识别方式">
      <ElRadioGroup
        v-model="form.mode"
        :disabled="disabled || saving || testing || !status?.storage_ready"
      >
        <ElRadio value="local">本地模型</ElRadio><ElRadio value="cloud">云端 API</ElRadio>
      </ElRadioGroup>
      <p class="asr-help">
        Whisper 按下方执行位置使用本机或工作节点；Paraformer 由服务器本机 CPU
        执行。云端 API 由后端调用所选供应商，不依赖工作节点。
      </p>
    </ElFormItem>
    <template v-if="form.mode === 'local'">
      <ElFormItem label="本地识别引擎">
        <div class="provider-options">
          <ElButton
            :type="form.local_engine === 'whisper' ? 'primary' : 'default'"
            :disabled="busy"
            @click="selectLocalEngine('whisper')"
          >
            Whisper
</ElButton><ElButton
            :type="form.local_engine === 'paraformer' ? 'primary' : 'default'"
            :disabled="busy"
            @click="selectLocalEngine('paraformer')"
          >
            FunASR Paraformer
          </ElButton>
        </div>
        <p class="asr-help">
          切换后需保存配置才会用于新任务；两种引擎的模型与依赖分别安装。
        </p>
      </ElFormItem>
      <ElFormItem label="本地模型执行位置">
        <ElRadioGroup
          v-if="form.local_engine === 'whisper'"
          v-model="form.local_execution"
          :disabled="busy"
        >
          <ElRadio value="local">local · 本机处理</ElRadio><ElRadio value="worker">worker · 远程工作节点</ElRadio>
        </ElRadioGroup>
        <ElRadioGroup v-else model-value="local" disabled>
          <ElRadio value="local">local · 本机 CPU 处理</ElRadio><ElRadio value="worker">worker · 暂不支持</ElRadio>
        </ElRadioGroup>
        <p class="asr-help">
          Whisper 执行位置从后台数据库读取，保存后新任务生效。worker
          需要在线且具备语音识别能力的节点；模型须安装在对应节点。Paraformer
          当前仅支持本机 CPU，切换回来会保留 Whisper 的执行位置选择。
        </p>
      </ElFormItem>
      <template v-if="form.local_engine === 'whisper'">
        <div class="whisper-summary">
          <strong>Whisper · {{ currentLocalModel }}</strong>
          <p class="asr-help">
            本地语音识别使用
            faster-whisper。型号越大，通常需要更多内存、显存与计算时间。
          </p>
        </div>
        <ElFormItem
          v-for="field in localFields"
          :key="field.key"
          :label="
            field.key === 'whisperModel' ? 'Whisper 模型型号' : field.label
          "
        >
          <ElSelect
            v-model="localValues[field.key]"
            :disabled="disabled || saving || testing"
          >
            <ElOption
              v-for="option in field.options || []"
              :key="String(option.value)"
              :label="option.label"
              :value="String(option.value)"
            />
          </ElSelect>
          <p class="asr-help">{{ field.description }}</p>
        </ElFormItem>
        <div class="installation-guide">
          <h3>本地模型不存在时如何安装</h3>
          <p class="asr-help">
            本项目仅从本地加载模型，首次使用不会自动下载。请先选择并保存型号，再在实际执行识别的机器上进入后端项目目录，运行以下命令，下载完成后再提交识别任务。
          </p>
          <p class="asr-help">macOS / Linux：</p>
          <pre>{{ downloadCommand }}</pre>
          <p class="asr-help">Windows 工作节点（PowerShell）：</p>
          <pre>{{ windowsDownloadCommand }}</pre>
          <p v-if="form.local_execution === 'worker'" class="asr-help">
            当前由工作节点执行识别：请在每个接收语音识别任务的节点上下载，并保持节点在线。服务器上的模型目录不是远程节点目录；节点实际保存到其
            CREATORHUB_DATA_DIR/models。
          </p>
          <p v-else class="asr-help">
            当前由服务器本机执行识别，请在服务器上下载模型。
          </p>
          <p class="asr-help">
            服务器模型目录：<code>{{
              status?.local_installation?.models_directory ||
              '后端配置的数据目录/models'
            }}</code>。下载命令会使用执行机器的
            CREATORHUB_DATA_DIR/models，下载用户应与运行后端或节点的用户一致。
          </p>
          <p class="asr-help">
            需先安装项目依赖；下载需要访问模型仓库，可能耗时较长。CPU 可先选
            small / cpu / int8；缺少模型或没有可用工作节点时，也可切换云端 API。
          </p>
          <p v-if="status?.local_installation?.note" class="asr-help">
            {{ status.local_installation.note }}
          </p>
        </div>
      </template>
      <template v-else>
        <div class="whisper-summary">
          <strong>FunASR Paraformer · 中文模型</strong>
          <p class="asr-help">
            将中文语音转换成文字，使用本地 CPU 运行；不使用 Whisper
            的型号、设备及计算精度配置。
          </p>
        </div>
        <div class="installation-guide">
          <h3>安装本地 FunASR Paraformer</h3>
          <ElAlert
            title="需准备约 2GB 模型及 torch / funasr 依赖。首次安装可能较久，并占用磁盘与内存；运行识别不会自动下载安装。"
            type="warning"
            :closable="false"
            class="mt-3"
          />
          <p class="asr-help">
            安装脚本使用独立的 .venv-offline-asr
            环境，避免修改后端原有依赖。在运行 Python
            后端的服务器本机，进入后端项目根目录。macOS / Linux 可运行：
          </p>
          <pre>{{
            status?.local_installation?.paraformer_install_command ||
            'bash scripts/install_offline_asr.sh'
          }}</pre>
          <p class="asr-help">仅检查依赖和模型，不下载：</p>
          <pre>{{
            status?.local_installation?.paraformer_check_command ||
            'bash scripts/install_offline_asr.sh --check'
          }}</pre>
          <p class="asr-help">
            此安装脚本用于 macOS/Linux 后端。Windows 原生后端暂不支持此 Bash
            安装器；若使用 WSL，后端也须运行在同一 WSL 环境，不能只在 WSL
            安装后给 Windows
            后端使用。下载时使用与后端一致的数据目录配置和运行用户。
          </p>
          <p class="asr-help">
            Paraformer 由后端服务器本机使用 CPU 执行，不走 Whisper
            工作节点。请在服务器上安装后，点击“重新检查”确认是否就绪。
          </p>
          <p
            v-if="status?.local_installation?.paraformer_note"
            class="asr-help"
          >
            {{ status.local_installation.paraformer_note }}
          </p>
          <p class="asr-help">
            服务器模型目录：<code>{{
              status?.local_installation?.paraformer_directory ||
              '后端配置的 Paraformer 模型目录'
            }}</code>。
          </p>
          <ElButton
            :loading="localChecking"
            :disabled="loading || saving || testing"
            @click="checkLocal"
          >
            重新检查
          </ElButton>
          <ElAlert
            v-if="localCheckResult"
            :title="localCheckResult.message"
            :type="localCheckResult.ready ? 'success' : 'warning'"
            :closable="false"
            class="mt-3"
          />
          <p v-if="localCheckResult" class="asr-help">
            服务器依赖：{{
              localCheckResult.dependencies_ready ? '已就绪' : '未就绪'
            }}；模型目录：<code>{{ localCheckResult.model_directory }}</code>。<template v-if="localCheckResult.missing_models.length">
              缺少模型：{{ localCheckResult.missing_models.join('、') }}。
            </template>
          </p>
          <p v-else class="asr-help">
            点击“重新检查”确认服务器本机的依赖和模型状态；检查不会安装依赖或下载模型。
          </p>
        </div>
      </template>
    </template>
    <template v-if="form.mode === 'cloud'">
      <ElAlert
        v-if="status && !status.encryption_ready"
        title="ASR 加解密文件缺失，请从备份恢复文件；旧 API Key 无法解密。"
        type="warning"
        :closable="false"
        class="mb-4"
      />
      <ElFormItem label="云端识别提供商">
        <div class="provider-options">
          <ElButton
            v-for="provider in providers"
            :key="provider.key"
            :type="form.provider === provider.key ? 'primary' : 'default'"
            :disabled="busy"
            @click="selectProvider(provider.key)"
          >
            {{ provider.label }}
          </ElButton>
        </div>
        <p v-if="form.provider === 'dashscope'" class="asr-help">
          使用阿里云百炼华北2（北京）地域的 API Key。
        </p>
        <p v-else class="asr-help">
          使用阶跃星辰 Step Plan 的 API Key，模型为
          stepaudio-2.5-asr；请确认订阅与语音识别权限。供应商的密钥分别保存，切换选项不会自动保存。
        </p>
      </ElFormItem>
      <ElFormItem label="语音识别模型">
        <ElSelect v-model="form.model" :disabled="busy">
          <ElOption
            :label="selectedProvider.model"
            :value="selectedProvider.model"
          />
        </ElSelect>
      </ElFormItem>
      <ElFormItem :label="`${selectedProvider.label} API Key`">
        <ElInput
          v-model="form.api_key"
          :type="form.api_key === '************' ? 'text' : 'password'"
          :show-password="form.api_key !== '************'"
          :disabled="disabled || saving || testing"
          autocomplete="new-password"
          placeholder="未配置"
          maxlength="2048"
        />
        <p class="asr-help">
          已配置时仅回显 ************。保留 ************
          或留空保存不会修改原密钥；输入新 Key 才会替换。请使用当前供应商对应的
          API Key。
        </p>
        <p class="asr-help">
          供应商 API Key
          分别加密存入数据库；加解密密钥首次保存时自动生成，无需配置环境变量。文件位置：<code>{{
              status?.encryption_key_file || '后端项目/storage/secrets/asr.key'
            }}</code>。请单独备份，迁移或多实例部署时使用同一文件，不要删除或替换。
        </p>
      </ElFormItem>
      <ElFormItem label="请求超时（秒）">
        <ElInputNumber
          v-model="form.timeout_seconds"
          :min="10"
          :max="300"
          :precision="0"
          :disabled="disabled || saving || testing"
        />
      </ElFormItem>
      <ElButton
        :loading="testing"
        :disabled="disabled || saving || loading"
        @click="probe"
      >
        测试在线 ASR 连通性
      </ElButton>
      <p class="asr-help">
        使用当前填写的配置测试，不自动保存。发送短静音音频，不创建文案任务或扣用户积分；供应商可能按其规则计费。
      </p>
      <ElAlert
        v-if="testResult"
        :title="testResult.message"
        :type="testResult.ok ? 'success' : 'error'"
        show-icon
        :closable="false"
        class="mb-4"
      />
    </template>
    <ElButton
      type="primary"
      :loading="saving"
      :disabled="disabled || testing || loading || !status?.storage_ready"
      @click="save"
    >
      保存语音识别配置
    </ElButton>
    <p class="asr-help">
      识别方式、模型参数和密钥一起保存，新任务采用新配置；已提交的任务继续使用原配置。
    </p>
  </div>
</template>

<style scoped>
.asr-config {
  margin-bottom: 20px;
}

.provider-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.provider-options :deep(.el-button) {
  min-height: 44px;
  padding: 12px 24px;
  margin-left: 0;
}

.whisper-summary,
.installation-guide {
  padding: 16px;
  margin: 0 0 18px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}

.whisper-summary strong {
  font-size: 18px;
}

.installation-guide h3 {
  margin: 0;
  font-weight: 600;
}

.installation-guide pre {
  padding: 12px;
  font-size: 13px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.asr-help code {
  overflow-wrap: anywhere;
}

.asr-help {
  width: 100%;
  margin: 6px 0 14px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.asr-config :deep(.el-select) {
  width: 100%;
}
</style>
