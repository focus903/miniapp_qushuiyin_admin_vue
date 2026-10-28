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
  ElOption,
  ElRadio,
  ElRadioGroup,
  ElSelect,
} from 'element-plus';

import { requestClient } from '#/api/request';

type Provider = 'aliyun_ims' | 'tencent_mps' | 'volc_mediakit';
type Form = {
  access_key_id: string;
  access_key_secret: string;
  aliyun_region: string;
  aliyun_subtitle_model: string;
  aliyun_subtitle_template_id: string;
  aliyun_watermark_template_id: string;
  subtitle_execution: 'local' | 'worker';
  watermark_execution: 'local' | 'worker';
  mode: 'cloud' | 'local';
  provider: Provider;
  secret_id: string;
  secret_key: string;
  api_key: string;
  subtitle_template_id: number;
  watermark_template_id: number;
  timeout_seconds: number;
  subtitle_tool: string;
  check_task_id: string;
};
type Profile = Form & { configured: boolean; endpoint: string };
type LocalValues = {
  videoSubtitleEngine: 'lama' | 'opencv';
  videoWatermarkEngine: 'lama' | 'opencv';
};
type Status = Profile & {
  local_values?: LocalValues;
  storage_ready: boolean;
  execution_ready: boolean;
  provider_configs: Record<Provider, Profile>;
};
type CheckResult = { ok: boolean; message: string; elapsed_ms?: number };
const props = defineProps<{ disabled?: boolean }>();
const providers = [
  { key: 'aliyun_ims' as const, label: '阿里云 IMS' },
  { key: 'tencent_mps' as const, label: '腾讯云 MPS' },
  { key: 'volc_mediakit' as const, label: '火山引擎 AI MediaKit' },
];
function defaults(provider: Provider): Form {
  return {
    access_key_id: '',
    access_key_secret: '',
    aliyun_region: 'cn-shanghai',
    aliyun_subtitle_model: 'algo-video-detext-new',
    aliyun_subtitle_template_id: '',
    aliyun_watermark_template_id: '',
    mode: 'local',
    subtitle_execution: 'local',
    watermark_execution: 'local',
    provider,
    secret_id: '',
    secret_key: '',
    api_key: '',
    subtitle_template_id: 0,
    watermark_template_id: 0,
    timeout_seconds: 20,
    subtitle_tool: 'erase-video-subtitle-pro',
    check_task_id: '',
  };
}
const form = reactive<Form>(defaults('tencent_mps'));
const localValues = reactive<LocalValues>({
  videoSubtitleEngine: 'lama',
  videoWatermarkEngine: 'lama',
});
const drafts = reactive<Partial<Record<Provider, Form>>>({});
const status = ref<Status>();
const loading = ref(false);
const saving = ref(false);
const checking = ref(false);
const errorMessage = ref('');
const result = ref<CheckResult | null>(null);
const busy = computed(
  () => props.disabled || loading.value || saving.value || checking.value,
);
const isTencent = computed(() => form.provider === 'tencent_mps');
const endpoint = computed(() => {
  if (isTencent.value) return 'https://mps.tencentcloudapi.com';
  if (form.provider === 'aliyun_ims')
    return `https://ice.${form.aliyun_region}.aliyuncs.com`;
  return 'https://mediakit.cn-beijing.volces.com';
});
function payload() {
  const common = {
    local_values: { ...localValues },
    mode: form.mode,
    provider: form.provider,
    timeout_seconds: form.timeout_seconds,
    subtitle_execution: form.subtitle_execution,
    watermark_execution: form.watermark_execution,
  };
  if (isTencent.value)
    return {
      ...common,
      secret_id: form.secret_id,
      secret_key: form.secret_key,
      subtitle_template_id: form.subtitle_template_id,
      watermark_template_id: form.watermark_template_id,
    };
  if (form.provider === 'aliyun_ims')
    return {
      ...common,
      access_key_id: form.access_key_id,
      access_key_secret: form.access_key_secret,
      aliyun_region: form.aliyun_region,
      aliyun_subtitle_model: form.aliyun_subtitle_model,
      aliyun_subtitle_template_id: form.aliyun_subtitle_template_id,
      aliyun_watermark_template_id: form.aliyun_watermark_template_id,
    };
  return {
    ...common,
    api_key: form.api_key,
    subtitle_tool: form.subtitle_tool,
    check_task_id: form.check_task_id,
  };
}
function apply(value: Status) {
  status.value = value;
  Object.assign(localValues, value.local_values || {});
  for (const provider of providers) {
    drafts[provider.key] = {
      ...defaults(provider.key),
      ...value.provider_configs[provider.key],
    };
  }
  const values = {
    ...defaults(value.provider),
    ...value.provider_configs[value.provider],
    ...value,
  };
  // Only copy form fields; server metadata must stay outside submissions.
  for (const key of Object.keys(defaults(value.provider)) as (keyof Form)[]) {
    Object.assign(form, { [key]: values[key] });
  }
}
function selectProvider(provider: Provider) {
  if (busy.value || provider === form.provider) return;
  drafts[form.provider] = { ...form };
  const shared = {
    mode: form.mode,
    subtitle_execution: form.subtitle_execution,
    watermark_execution: form.watermark_execution,
  };
  const values = {
    ...defaults(provider),
    ...(drafts[provider] || status.value?.provider_configs[provider]),
    provider,
    ...shared,
  };
  for (const key of Object.keys(defaults(provider)) as (keyof Form)[])
    Object.assign(form, { [key]: values[key] });
}
async function load() {
  loading.value = true;
  errorMessage.value = '';
  status.value = undefined;
  result.value = null;
  try {
    apply(await requestClient.get<Status>('/system/video-cloud-config'));
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
      await requestClient.put<Status>('/system/video-cloud-config', payload()),
    );
    ElMessage.success('视频处理配置已保存');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败';
  } finally {
    saving.value = false;
  }
}
async function check() {
  if (busy.value || !status.value) return;
  checking.value = true;
  errorMessage.value = '';
  result.value = null;
  try {
    result.value = await requestClient.post<CheckResult>(
      '/system/video-cloud-config/check',
      payload(),
      { timeout: 30_000 },
    );
  } catch (error) {
    result.value = {
      ok: false,
      message: error instanceof Error ? error.message : '配置检查失败',
    };
  } finally {
    checking.value = false;
  }
}
watch(form, () => {
  result.value = null;
});
onMounted(load);
</script>
<template>
  <ElForm v-loading="loading" label-position="top" :disabled="busy">
    <ElAlert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      :closable="false"
      class="mb-4"
    />
    <ElAlert
      v-if="status && !status.storage_ready"
      title="请先执行后端 AI 服务配置数据库迁移，再保存视频处理配置。"
      type="warning"
      :closable="false"
      class="mb-4"
    />
    <ElFormItem label="处理方式">
      <ElRadioGroup v-model="form.mode">
        <ElRadio value="local">本地处理</ElRadio><ElRadio value="cloud">云端 API</ElRadio>
      </ElRadioGroup>
      <p class="help">
        适用于视频去字幕、视频区域去水印。本地模型可分别选择本机或远程工作节点执行。
      </p>
    </ElFormItem>
    <ElAlert
      title="本地模型的执行位置保存后对新任务生效；云端 API 当前提供配置保存与检查，实际云端擦除执行尚未接入，云端模式暂沿用下方保存的本地执行位置。"
      type="info"
      :closable="false"
      class="mb-4"
    />
    <template v-if="form.mode === 'local'">
      <div class="fields local-sections">
        <section class="local-section">
          <h3>视频去字幕</h3>
          <ElFormItem label="本地修复引擎">
            <ElRadioGroup v-model="localValues.videoSubtitleEngine">
              <ElRadio value="lama">LaMa（效果优先）</ElRadio><ElRadio value="opencv"> OpenCV（CPU，速度优先） </ElRadio>
            </ElRadioGroup>
          </ElFormItem>
          <ElFormItem label="执行位置">
            <ElRadioGroup v-model="form.subtitle_execution">
              <ElRadio value="local">local · 本机处理</ElRadio><ElRadio value="worker"> worker · 远程工作节点 </ElRadio>
            </ElRadioGroup>
          </ElFormItem>
        </section>
        <section class="local-section">
          <h3>视频去水印</h3>
          <ElFormItem label="本地修复引擎">
            <ElRadioGroup v-model="localValues.videoWatermarkEngine">
              <ElRadio value="lama">LaMa（效果优先）</ElRadio><ElRadio value="opencv"> OpenCV（CPU，速度优先） </ElRadio>
            </ElRadioGroup>
          </ElFormItem>
          <ElFormItem label="执行位置">
            <ElRadioGroup v-model="form.watermark_execution">
              <ElRadio value="local">local · 本机处理</ElRadio><ElRadio value="worker"> worker · 远程工作节点 </ElRadio>
            </ElRadioGroup>
          </ElFormItem>
        </section>
      </div>
      <p class="help">
        LaMa 使用 AI 修复模型；OpenCV
        使用传统修复算法，两者统一归为本地处理。选择 worker
        时，需要在线且支持对应视频任务的工作节点，模型和依赖安装在实际执行的机器上。保存后新任务生效，已提交任务保留提交时的引擎和执行位置。上传大小限制仍在「小程序配置
        → 视频处理」中设置。
      </p>
    </template>
    <template v-else>
      <ElFormItem label="云端处理供应商">
        <div class="providers">
          <ElButton
            v-for="provider in providers"
            :key="provider.key"
            :type="form.provider === provider.key ? 'primary' : 'default'"
            @click="selectProvider(provider.key)"
          >
            {{ provider.label }}
          </ElButton>
        </div>
        <p class="help">
          {{
            isTencent
              ? '使用腾讯云 API 密钥 SecretId / SecretKey，需开通媒体处理（MPS）。'
              : form.provider === 'aliyun_ims'
                ? '使用阿里云 AccessKey，需开通智能媒体服务（IMS）并完成 RAM 和存储授权。'
                : '使用火山引擎 AI MediaKit API Key；与火山方舟的模型服务配置独立。'
          }}
        </p>
      </ElFormItem>
      <ElFormItem label="接口地址">
        <ElInput :model-value="endpoint" disabled />
      </ElFormItem>
      <template v-if="isTencent">
        <div class="fields">
          <ElFormItem label="SecretId">
            <ElInput
              v-model="form.secret_id"
              :type="form.secret_id === '************' ? 'text' : 'password'"
              :show-password="form.secret_id !== '************'"
              autocomplete="new-password"
              placeholder="腾讯云 API 密钥 SecretId"
              maxlength="2048"
            />
          </ElFormItem>
          <ElFormItem label="SecretKey">
            <ElInput
              v-model="form.secret_key"
              :type="form.secret_key === '************' ? 'text' : 'password'"
              :show-password="form.secret_key !== '************'"
              autocomplete="new-password"
              placeholder="腾讯云 API 密钥 SecretKey"
              maxlength="2048"
            />
          </ElFormItem>
          <ElFormItem label="去字幕模板 ID">
            <ElInputNumber
              v-model="form.subtitle_template_id"
              :min="0"
              :max="Number.MAX_SAFE_INTEGER"
              :precision="0"
            />
            <p class="help">腾讯云 MPS 智能擦除中类型为「去字幕」的模板 ID。</p>
          </ElFormItem>
          <ElFormItem label="去水印模板 ID">
            <ElInputNumber
              v-model="form.watermark_template_id"
              :min="0"
              :max="Number.MAX_SAFE_INTEGER"
              :precision="0"
            />
            <p class="help">
              类型为「去水印 / 去 Logo」的模板
              ID。自然修复背景需选择对应的无痕擦除能力。0
              表示未填写，可先保存凭据，填写两个模板后再检查。
            </p>
          </ElFormItem>
        </div>
        <p class="help">
          更换 SecretId 时须同时填写对应的新 SecretKey。<a
            href="https://cloud.tencent.com/document/practice/862/119629"
            target="_blank"
            rel="noopener noreferrer"
            >腾讯云接入说明</a>
        </p>
      </template>
      <template v-else-if="form.provider === 'volc_mediakit'">
        <ElFormItem label="API Key">
          <ElInput
            v-model="form.api_key"
            :type="form.api_key === '************' ? 'text' : 'password'"
            :show-password="form.api_key !== '************'"
            autocomplete="new-password"
            placeholder="AI MediaKit API Key"
            maxlength="2048"
          />
        </ElFormItem>
        <ElFormItem label="字幕擦除版本">
          <ElSelect v-model="form.subtitle_tool">
            <ElOption
              label="精细化版（支持指定区域）"
              value="erase-video-subtitle-pro"
            /><ElOption
              label="标准版（自动字幕擦除）"
              value="erase-video-subtitle"
            />
          </ElSelect>
        </ElFormItem>
        <p class="help">
          火山方案支持字幕擦除；文字水印使用精细化版 Text 模式。图形 Logo
          暂未纳入此配置对应的接口能力。<a
            href="https://github.com/volcengine/mediakit-cli/blob/main/skills/byted-mediakit-video/reference/erase-video-subtitle-pro.md"
            target="_blank"
            rel="noopener noreferrer"
            >火山官方接口说明（GitHub）</a>
        </p>
        <ElFormItem label="用于检查的已有任务 ID（可选）">
          <ElInput
            v-model="form.check_task_id"
            placeholder="amk-…，当前账号近30天已有任务"
            maxlength="184"
          />
          <p class="help">
            仅用于只读鉴权查询，不创建新任务。未填写时可保存配置，但无法通过云端鉴权检查。任务本身处理失败不影响查询权限检查。
          </p>
        </ElFormItem>
      </template>
      <template v-else>
        <div class="fields">
          <ElFormItem label="AccessKey ID">
            <ElInput
              v-model="form.access_key_id"
              :type="
                form.access_key_id === '************' ? 'text' : 'password'
              "
              :show-password="form.access_key_id !== '************'"
              autocomplete="new-password"
              placeholder="阿里云 RAM AccessKey ID"
              maxlength="2048"
            />
          </ElFormItem>
          <ElFormItem label="AccessKey Secret">
            <ElInput
              v-model="form.access_key_secret"
              :type="
                form.access_key_secret === '************' ? 'text' : 'password'
              "
              :show-password="form.access_key_secret !== '************'"
              autocomplete="new-password"
              placeholder="阿里云 AccessKey Secret"
              maxlength="2048"
            />
          </ElFormItem>
          <ElFormItem label="服务地域">
            <ElSelect v-model="form.aliyun_region">
              <ElOption label="华东2（上海）" value="cn-shanghai" /><ElOption
                label="华北2（北京）"
                value="cn-beijing"
              />
            </ElSelect>
            <p class="help">
              服务和输入输出 OSS
              存储须使用匹配地域；具体擦除能力以账号开通情况及官方支持地域为准。
            </p>
          </ElFormItem>
          <ElFormItem label="字幕擦除版本">
            <ElSelect v-model="form.aliyun_subtitle_model">
              <ElOption
                label="高级版（效果优先）"
                value="algo-video-detext-new"
              /><ElOption label="普通版" value="default" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="去字幕模板 ID（可选）">
            <ElInput
              v-model="form.aliyun_subtitle_template_id"
              placeholder="IMS 自定义字幕擦除模板 ID"
              maxlength="128"
            />
          </ElFormItem>
          <ElFormItem label="去图标模板 ID（可选）">
            <ElInput
              v-model="form.aliyun_watermark_template_id"
              placeholder="IMS 自定义图标擦除模板 ID"
              maxlength="128"
            />
          </ElFormItem>
        </div>
        <p class="help">
          更换 AccessKey ID 时须同时填写对应的新 AccessKey
          Secret。当前仅保存阿里云配置；检查按钮只校验格式，不发起云端鉴权或收费擦除任务。
        </p>
        <p class="help">
          <a
            href="https://help.aliyun.com/zh/ims/user-guide/intelligent-erasure/"
            target="_blank"
            rel="noopener noreferrer"
            >阿里云 IMS 智能擦除文档</a>
          ·
          <a
            href="https://help.aliyun.com/zh/ims/developer-reference/api-ice-2020-11-09-submitiproductionjob"
            target="_blank"
            rel="noopener noreferrer"
            >提交智能生产任务 API</a>
        </p>
      </template>
      <p class="help">
        凭据按供应商分别加密保存；已保存仅显示
        ************，留空或保留掩码沿用该供应商原值。切换供应商不会混用密钥，未保存的表单内容可在本页切换后继续编辑。
      </p>
      <ElFormItem label="检查超时（秒）">
        <ElInputNumber
          v-model="form.timeout_seconds"
          :min="5"
          :max="20"
          :precision="0"
        />
      </ElFormItem>
      <ElButton :loading="checking" :disabled="!status" @click="check">
        检查配置
      </ElButton>
      <p class="help">
        使用当前表单检查，不自动保存。腾讯云检查鉴权、模板查询权限和擦除类型；火山检查鉴权与已有任务查询权限；阿里云目前仅检查配置格式，尚未验证云端鉴权。不提交视频任务，不扣用户积分；检查通过不代表实际擦除权限、输出存储和效果已验证。
      </p>
      <ElAlert
        v-if="result"
        :title="result.message"
        :type="result.ok ? 'success' : 'warning'"
        :closable="false"
        class="mb-4"
      />
    </template>
    <ElButton
      type="primary"
      :loading="saving"
      :disabled="!status?.storage_ready"
      @click="save"
    >
      保存视频处理配置
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

.help a {
  color: var(--el-color-primary);
}

.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 0 24px;
}

.local-section {
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}

.local-section h3 {
  margin: 0 0 18px;
  font-size: 16px;
  font-weight: 600;
}

.providers {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  width: 100%;
  max-width: 760px;
}

.providers :deep(.el-button) {
  flex: 1 1 260px;
  min-height: 54px;
  margin-left: 0;
  font-size: 16px;
  font-weight: 600;
}
</style>
