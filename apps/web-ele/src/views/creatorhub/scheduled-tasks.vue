<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';
import { ElAlert, ElButton, ElCard, ElForm, ElFormItem, ElInputNumber, ElMessage, ElOption, ElSelect, ElSwitch, ElTabPane, ElTabs, ElTimeSelect } from 'element-plus';
import { requestClient } from '#/api/request';

interface Config {
  enabled: boolean;
  mode: 'daily' | 'interval';
  interval_seconds: number;
  daily_time: string;
  retention_seconds: number | null;
  revision: number;
}
interface Task extends Config {
  code: string;
  name: string;
  description: string;
  retention_help: string;
  warning: string;
  minimum_interval: number;
  state: { last_started: number; last_finished: number; next_run: number; status: string; error: string | null };
}
interface Result { timezone: string; reload_seconds: number; items: Task[] }
interface Draft { config: Config; intervalValue: number | undefined; intervalUnit: number; retentionValue: number | undefined; retentionUnit: number; baseline: string }
const units = [{ label: '秒', value: 1 }, { label: '分钟', value: 60 }, { label: '小时', value: 3600 }, { label: '天', value: 86400 }];
const access = useAccessStore();
const canSave = computed(() => access.accessCodes.includes('scheduled-tasks:update'));
const tasks = ref<Task[]>([]);
const drafts = reactive<Record<string, Draft>>({});
const active = ref('');
const busy = ref(false);
const saving = ref('');
const error = ref('');
const reloadSeconds = ref(30);
function duration(seconds: number) {
  const unit = [...units].reverse().find((candidate) => seconds % candidate.value === 0)?.value ?? 1;
  return { value: seconds / unit, unit };
}
function values(draft: Draft): Config {
  return { ...draft.config, interval_seconds: (draft.intervalValue ?? 0) * draft.intervalUnit, retention_seconds: draft.config.retention_seconds === null ? null : (draft.retentionValue ?? 0) * draft.retentionUnit };
}
function adopt(task: Task) {
  const interval = duration(task.interval_seconds);
  const retention = duration(task.retention_seconds ?? 1);
  const config: Config = { enabled: task.enabled, mode: task.mode, interval_seconds: task.interval_seconds, daily_time: task.daily_time, retention_seconds: task.retention_seconds, revision: task.revision };
  drafts[task.code] = { config, intervalValue: interval.value, intervalUnit: interval.unit, retentionValue: retention.value, retentionUnit: retention.unit, baseline: JSON.stringify(config) };
}
function dirty(code: string) { const draft = drafts[code]; return !!draft && JSON.stringify(values(draft)) !== draft.baseline; }
function validation(task: Task) {
  const draft = drafts[task.code];
  if (!draft) return '';
  const config = values(draft);
  if (!Number.isSafeInteger(config.interval_seconds) || config.interval_seconds < task.minimum_interval || config.interval_seconds > 604800) return `执行间隔必须为整数秒，范围为 ${task.minimum_interval}～604800 秒（最多 7 天）。`;
  if (config.mode === 'daily' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(config.daily_time)) return '请选择每天执行的北京时间（HH:mm）。';
  if (config.retention_seconds !== null && (!Number.isSafeInteger(config.retention_seconds) || config.retention_seconds < 60 || config.retention_seconds > 31536000)) return '保留期限必须为 60～31536000 秒的整数（1 分钟～365 天）。';
  return '';
}
function time(value: number) {
  if (!value) return '暂无';
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? '暂无' : date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}
function status(value: string) {
  const labels: Record<string, string> = { idle: '等待执行', pending: '等待执行', running: '执行中', success: '执行成功', succeeded: '执行成功', error: '执行失败', failed: '执行失败', disabled: '已停用', skipped: '已跳过' };
  return labels[value] ?? value;
}
async function load() {
  if (busy.value || saving.value) return;
  busy.value = true; error.value = '';
  try {
    const result = await requestClient.get<Result>('/system/scheduled-tasks');
    for (const task of result.items) if (!drafts[task.code] || !dirty(task.code)) adopt(task);
    tasks.value = result.items;
    reloadSeconds.value = result.reload_seconds;
    if (!tasks.value.some((task) => task.code === active.value)) active.value = tasks.value[0]?.code ?? '';
  } catch { error.value = '加载失败，请刷新重试。现有未保存的配置仍保留。'; }
  finally { busy.value = false; }
}
async function save(task: Task) {
  const draft = drafts[task.code];
  if (!draft || !canSave.value || busy.value || saving.value) return;
  const message = validation(task);
  if (message) { ElMessage.error(message); return; }
  saving.value = task.code;
  try {
    const saved = await requestClient.put<Task>(`/system/scheduled-tasks/${encodeURIComponent(task.code)}`, values(draft));
    adopt(saved);
    tasks.value = tasks.value.map((item) => item.code === saved.code ? saved : item);
    ElMessage.success(`已保存，约 ${reloadSeconds.value} 秒内生效；请刷新查看重新计算的下一次执行时间。`);
  } catch { /* 接口统一显示错误；保留草稿及原 revision，避免覆盖其他管理员的修改。 */ }
  finally { saving.value = ''; }
}
onMounted(load);
</script>

<template>
  <Page title="定时任务">
    <ElCard shadow="never">
      <ElAlert class="mb-4" title="执行时间统一使用北京时间（UTC+8）。每个任务单独保存；切换任务或刷新状态会保留未保存的表单。" type="info" :closable="false" show-icon />
      <p class="help">执行间隔决定多久检查一次；保留期限决定文件保留多久，两者互不替代。保存后约 {{ reloadSeconds }} 秒内生效，并重新计算下一次执行时间。后端重启时，已到期的任务补执行一次，不重复补跑所有错过的周期。</p>
      <p class="help">运行状态仅显示当前后端实例。多个部署共享任务配置，各实例清理各自保存的素材文件。</p>
      <ElButton class="mb-4" :loading="busy" :disabled="!!saving" @click="load">刷新配置与运行状态</ElButton>
      <ElAlert v-if="error" class="mb-4" :title="error" type="error" :closable="false" />
      <ElTabs v-model="active">
        <ElTabPane v-for="task in tasks" :key="task.code" :name="task.code" :label="`${task.name}${dirty(task.code) ? ' · 未保存' : ''}`">
          <template v-if="drafts[task.code]">
            <h3 class="task-title">{{ task.name }}</h3>
            <p class="description">{{ task.description }}</p>
            <ElAlert v-if="task.warning" class="mb-4" :title="task.warning" type="warning" :closable="false" show-icon />
            <ElAlert v-if="!drafts[task.code]!.config.enabled" class="mb-4" title="停用仅停止此项自动维护，业务仍可使用。过期文件可能持续占用磁盘，恢复或补偿任务可能延迟；请结合上方任务说明评估风险。" type="warning" :closable="false" show-icon />
            <ElForm label-position="top" :disabled="!canSave || busy || !!saving">
              <ElFormItem label="自动执行"><ElSwitch v-model="drafts[task.code]!.config.enabled" active-text="启用" inactive-text="停用" /></ElFormItem>
              <ElFormItem label="执行方式">
                <ElSelect v-model="drafts[task.code]!.config.mode" class="mode-select"><ElOption label="按间隔执行" value="interval" /><ElOption label="每天定点执行" value="daily" /></ElSelect>
              </ElFormItem>
              <ElFormItem v-if="drafts[task.code]!.config.mode === 'interval'" label="执行间隔">
                <div><div class="duration"><ElInputNumber v-model="drafts[task.code]!.intervalValue" :min="1" :precision="0" aria-label="执行间隔数值" /><ElSelect v-model="drafts[task.code]!.intervalUnit" aria-label="执行间隔单位"><ElOption v-for="unit in units" :key="unit.value" :label="unit.label" :value="unit.value" /></ElSelect></div><p class="help">两次自动执行之间的间隔，范围 {{ task.minimum_interval }}～604800 秒（最多 7 天）。改变间隔会重新计算下一次执行时间。</p></div>
              </ElFormItem>
              <ElFormItem v-else label="每天执行时间（北京时间）"><div><ElTimeSelect v-model="drafts[task.code]!.config.daily_time" start="00:00" end="23:59" step="00:01" placeholder="选择 HH:mm" /><p class="help">每天在所选时间执行一次；修改后从下一个指定时间开始。</p></div></ElFormItem>
              <ElFormItem label="保留期限">
                <div v-if="task.retention_seconds !== null"><div class="duration"><ElInputNumber v-model="drafts[task.code]!.retentionValue" :min="1" :precision="0" aria-label="保留期限数值" /><ElSelect v-model="drafts[task.code]!.retentionUnit" aria-label="保留期限单位"><ElOption v-for="unit in units" :key="unit.value" :label="unit.label" :value="unit.value" /></ElSelect></div><p class="help">{{ task.retention_help }}</p><p class="help">可设置范围为 1 分钟～365 天（60～31536000 秒）。文件保留期限变更对新生成的文件生效；已有文件已记录的到期时间不会回写。错误日志按创建时间滚动清理，缩短期限会影响已有日志，请留意任务警示。</p></div>
                <p v-else class="help">不适用：此任务不按文件保留期限清理。{{ task.retention_help }}</p>
              </ElFormItem>
            </ElForm>
            <ElAlert v-if="validation(task)" class="mb-4" :title="validation(task)" type="warning" :closable="false" />
            <ElButton v-if="canSave" type="primary" :loading="saving === task.code" :disabled="busy || !!saving || !dirty(task.code) || !!validation(task)" @click="save(task)">保存此任务配置</ElButton>
            <ElButton v-if="canSave" :disabled="busy || !!saving || !dirty(task.code)" @click="adopt(task)">撤销此任务未保存修改</ElButton>
            <p v-if="dirty(task.code) && drafts[task.code]!.config.revision !== task.revision" class="help">其他管理员已修改此任务。请先记录需要保留的输入，再撤销未保存修改以加载最新配置，重新编辑后保存。</p>
            <p v-if="!canSave" class="help">当前账号只有查看权限，无法修改任务配置。</p>
            <section class="state"><h3 class="task-title">当前实例最近运行状态（刷新后更新）</h3><dl><dt>当前状态</dt><dd>{{ status(task.state.status) }}</dd><dt>最近开始时间</dt><dd>{{ time(task.state.last_started) }}</dd><dt>最近结束时间</dt><dd>{{ time(task.state.last_finished) }}</dd><dt>下一次执行时间</dt><dd>{{ task.enabled ? time(task.state.next_run) : '已停用，无自动执行计划' }}</dd></dl><ElAlert v-if="task.state.error" :title="task.state.error" type="error" :closable="false" show-icon /></section>
          </template>
        </ElTabPane>
      </ElTabs>
      <p v-if="!busy && !error && tasks.length === 0" class="help">暂无可配置的定时任务。</p>
    </ElCard>
  </Page>
</template>

<style scoped>
.task-title { margin-bottom: 12px; font-size: 16px; font-weight: 600; }
.description { margin-bottom: 16px; line-height: 1.8; white-space: pre-line; }
.help { margin: 8px 0 16px; color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.7; }
.duration { display: flex; flex-wrap: wrap; gap: 8px; }
.duration :deep(.el-select) { width: 110px; }
.mode-select { width: 220px; }
.state { margin-top: 24px; padding: 16px; border: 1px solid var(--el-border-color-light); border-radius: 8px; }
dl { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; margin-bottom: 16px; }
dd { overflow-wrap: anywhere; }
@media (max-width: 480px) { dl { grid-template-columns: 1fr; gap: 4px; } dd { margin-bottom: 12px; } }
</style>
