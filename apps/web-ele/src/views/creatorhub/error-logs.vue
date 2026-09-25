<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { ElAlert, ElButton, ElCard, ElDatePicker, ElDialog, ElInput, ElInputNumber, ElMessage, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus';
import { requestClient } from '#/api/request';

interface ErrorEntry {
  id: string; created: number; request_id: string; source: string; method: string;
  path: string; status: number; exception_type: string; message: string;
  traceback?: string; task_id: string; node: string;
  level?: string;
  request_context?: {
    request_url?: string; user_id?: string | null; platform?: string;
    duration_ms?: number; stage?: string; body?: unknown; query?: unknown;
  } | null;
}
interface Health {
  directory: string; retentionDays: number; databaseFailures: number;
  fileFailures: number; queueDrops: number; fileOnly: number; pending: number;
}
const rows = ref<ErrorEntry[]>([]);
const total = ref(0);
const page = ref(1);
const keyword = ref('');
const path = ref('');
const status = ref<number>();
const level = ref('');
const dates = ref<[Date, Date]>();
const busy = ref(false);
const error = ref('');
const health = ref<Health>();
const selected = ref<ErrorEntry>();
const dialog = ref(false);
const detailBusy = ref(false);
const detailError = ref('');
let generation = 0;
let detailGeneration = 0;
const degraded = computed(() => health.value && (health.value.databaseFailures || health.value.fileFailures || health.value.queueDrops));
const formattedTime = (value: number) => new Date(value * 1000).toLocaleString();
const stages: Record<string, string> = {
  request_validation: '请求参数校验', share_link_validation: '分享链接校验',
  benefit_check: '权益检查', parse_and_output: '平台解析及媒体输出',
  parse_and_transcribe: '链接解析及音频转文字', transcript_record: '文案记录保存',
  parse_request: '解析请求', request_context_unavailable: '请求上下文采集失败',
};
async function load() {
  const current = ++generation;
  busy.value = true;
  error.value = '';
  try {
    const result = await requestClient.get<{items: ErrorEntry[]; total: number; health: Health | null}>('/system/error-logs', {params: {
      page: page.value, page_size: 20, keyword: keyword.value, path: path.value,
      status: status.value ?? undefined, level: level.value || undefined,
      start: dates.value?.[0] ? Math.floor(dates.value[0].getTime() / 1000) : undefined,
      end: dates.value?.[1] ? Math.floor(dates.value[1].getTime() / 1000) : undefined,
    }});
    if (current !== generation) return;
    rows.value = result.items;
    total.value = result.total;
    health.value = result.health ?? undefined;
  } catch (cause) {
    if (current !== generation) return;
    error.value = cause instanceof Error ? cause.message : '读取错误日志失败，请检查数据库连接及迁移。';
    rows.value = []; total.value = 0;
  } finally { if (current === generation) busy.value = false; }
}
function search() { page.value = 1; load(); }
function reset() { keyword.value = ''; path.value = ''; status.value = undefined; level.value = ''; dates.value = undefined; search(); }
async function details(row: ErrorEntry) {
  const current = ++detailGeneration;
  selected.value = undefined;
  dialog.value = true; detailBusy.value = true; detailError.value = '';
  try {
    const result = await requestClient.get<ErrorEntry>(`/system/error-logs/${row.id}`);
    if (current === detailGeneration) selected.value = result;
  } catch (cause) {
    if (current === detailGeneration) detailError.value = cause instanceof Error ? cause.message : '详情读取失败';
  } finally { if (current === detailGeneration) detailBusy.value = false; }
}
async function copyText(value: string) {
  try { await navigator.clipboard.writeText(value); ElMessage.success('已复制'); }
  catch { ElMessage.warning('复制失败，请手动选择详情文字复制'); }
}
function requestParameters(entry: ErrorEntry) {
  return JSON.stringify({ query: entry.request_context?.query, body: entry.request_context?.body }, null, 2);
}
async function copy() {
  if (!selected.value) return;
  try { await navigator.clipboard.writeText(JSON.stringify(selected.value, null, 2)); ElMessage.success('已复制脱敏日志'); }
  catch { ElMessage.warning('复制失败，请手动选择详情文字复制'); }
}
onMounted(load);
</script>

<template>
  <Page title="错误日志">
    <ElAlert title="记录解析接口的 422、HTTP 500～599 和后台任务异常，默认保留30天。解析失败详情包含脱敏请求完整地址和参数；令牌、Cookie、密码等隐藏，超长内容截断。" type="info" :closable="false" class="mb-4" />
    <ElAlert v-if="error" :title="error" type="error" show-icon :closable="false" class="mb-4" />
    <ElAlert v-if="degraded" :title="`当前进程累计：数据库写入/清理失败 ${health?.databaseFailures} 次，文件操作失败 ${health?.fileFailures} 次，入库队列溢出 ${health?.queueDrops} 条。数据库列表可能不完整，请检查文件日志。`" type="warning" :closable="false" class="mb-4" />
    <ElCard>
      <div class="filters">
        <ElInput v-model="keyword" placeholder="错误原因 / 异常类型 / 请求或任务编号" clearable aria-label="关键词" @keyup.enter="search" />
        <ElInput v-model="path" placeholder="接口路径或任务类型" clearable aria-label="接口路径" @keyup.enter="search" />
        <ElInputNumber v-model="status" :min="400" :max="599" :precision="0" :controls="false" placeholder="422 / 500" aria-label="状态码" />
        <ElSelect v-model="level" placeholder="全部级别" clearable aria-label="日志级别" @change="search">
          <ElOption label="警告（WARNING）" value="WARNING" />
          <ElOption label="错误（ERROR）" value="ERROR" />
        </ElSelect>
        <ElDatePicker v-model="dates" type="datetimerange" start-placeholder="开始时间" end-placeholder="结束时间" />
        <ElButton type="primary" :loading="busy" @click="search">查询</ElButton>
        <ElButton @click="reset">重置</ElButton>
        <ElButton :disabled="busy" @click="load">刷新</ElButton>
      </div>
      <ElTable v-loading="busy" :data="rows" empty-text="暂无符合条件的错误日志">
        <ElTableColumn label="发生时间" width="180"><template #default="{row}">{{ formattedTime(row.created) }}</template></ElTableColumn>
        <ElTableColumn label="状态" width="90"><template #default="{row}"><ElTag :type="row.level === 'WARNING' ? 'warning' : 'danger'">{{ row.status }}</ElTag></template></ElTableColumn>
        <ElTableColumn label="级别" width="105"><template #default="{row}">{{ row.level || 'ERROR' }}</template></ElTableColumn>
        <ElTableColumn label="来源" width="100"><template #default="{row}">{{ row.source === 'parse' ? '解析失败' : row.source === 'task' ? '后台任务' : row.method }}</template></ElTableColumn>
        <ElTableColumn prop="path" label="接口 / 任务" min-width="180" show-overflow-tooltip />
        <ElTableColumn prop="message" label="错误原因" min-width="240">
          <template #default="{row}">
            <div class="message-cell"><span class="message-text" :title="row.message">{{ row.message || '—' }}</span><ElButton v-if="row.message" link type="primary" @click.stop="copyText(row.message)">复制</ElButton></div>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="exception_type" label="异常类型" width="160" show-overflow-tooltip />
        <ElTableColumn label="操作" width="80" fixed="right"><template #default="{row}"><ElButton link type="primary" @click="details(row as ErrorEntry)">详情</ElButton></template></ElTableColumn>
      </ElTable>
      <ElPagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next, jumper" class="mt-4" @current-change="load" />
      <p v-if="health" class="storage-hint">当前节点文件目录：{{ health.directory }} · 保留 {{ health.retentionDays }} 天 · 待入库 {{ health.pending }} 条 · 维护期间仅写文件 {{ health.fileOnly }} 条</p>
    </ElCard>
    <ElDialog v-model="dialog" title="错误详情" width="min(900px, 94vw)">
      <div v-loading="detailBusy" class="detail-content">
        <ElAlert v-if="detailError" :title="detailError" type="error" :closable="false" />
        <template v-if="selected">
          <p>时间：{{ formattedTime(selected.created) }} · 状态：{{ selected.status }}</p>
          <p>请求编号：{{ selected.request_id }}</p>
          <p>接口 / 任务：{{ selected.method }} {{ selected.path }}</p>
          <p v-if="selected.task_id">任务编号：{{ selected.task_id }}</p>
          <p>节点：{{ selected.node }}</p>
          <p>异常类型：{{ selected.exception_type || '未提供异常对象' }}</p>
          <div v-if="selected.message" class="detail-heading"><h3>错误结果</h3><ElButton link type="primary" @click="copyText(selected.message)">复制结果</ElButton></div>
          <pre v-if="selected.message">{{ selected.message }}</pre>
          <template v-if="selected.request_context">
            <div class="detail-heading"><h3>请求完整地址（已脱敏）</h3><ElButton v-if="selected.request_context.request_url" link type="primary" @click="copyText(selected.request_context.request_url)">复制地址</ElButton></div>
            <pre>{{ selected.request_context.request_url || '未记录' }}</pre>
            <p>平台：{{ selected.request_context.platform || '未识别' }} · 用户 ID：{{ selected.request_context.user_id || '未取得' }} · 耗时：{{ selected.request_context.duration_ms ?? '未知' }} ms</p>
            <p>失败阶段：{{ stages[selected.request_context.stage || ''] || selected.request_context.stage || '未知' }}</p>
            <div class="detail-heading"><h3>请求参数（已脱敏）</h3><ElButton v-if="selected.request_context.body != null || selected.request_context.query != null" link type="primary" @click="copyText(requestParameters(selected))">复制参数</ElButton></div>
            <pre>{{ requestParameters(selected) }}</pre>
          </template>
          <div class="detail-heading"><h3>异常堆栈</h3><ElButton v-if="selected.traceback" link type="primary" @click="copyText(selected.traceback)">复制堆栈</ElButton></div>
          <pre>{{ selected.traceback || '该响应未附带异常堆栈。' }}</pre>
        </template>
      </div>
      <template #footer><ElButton :disabled="!selected || detailBusy" @click="copy">复制脱敏日志</ElButton><ElButton @click="dialog = false">关闭</ElButton></template>
    </ElDialog>
  </Page>
</template>

<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.filters > :deep(.el-input) { width: 260px; }
.filters > :deep(.el-select) { width: 190px; }
.filters > :deep(.el-input-number) { width: 130px; }
.filters > :deep(.el-date-editor) { max-width: 100%; }
.message-cell { display: flex; align-items: center; gap: 8px; min-width: 0; }
.message-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.message-cell .el-button { flex-shrink: 0; }
.storage-hint { color: var(--el-text-color-secondary); font-size: 12px; margin-top: 16px; overflow-wrap: anywhere; }
.detail-content { min-height: 100px; overflow-wrap: anywhere; }
.detail-content p { margin-bottom: 8px; }
.detail-content h3 { margin: 16px 0 8px; font-weight: 600; }
.detail-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 16px 0 8px; }
.detail-heading h3 { margin: 0; }
.detail-content pre { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--el-fill-color-light); border-radius: 6px; padding: 12px; max-height: 420px; overflow: auto; }
</style>
