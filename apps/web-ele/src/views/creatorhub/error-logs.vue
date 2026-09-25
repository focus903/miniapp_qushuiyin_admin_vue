<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { ElAlert, ElButton, ElCard, ElDatePicker, ElDialog, ElInput, ElInputNumber, ElMessage, ElPagination, ElTable, ElTableColumn, ElTag } from 'element-plus';
import { requestClient } from '#/api/request';

interface ErrorEntry {
  id: string; created: number; request_id: string; source: string; method: string;
  path: string; status: number; exception_type: string; message: string;
  traceback?: string; task_id: string; node: string;
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
async function load() {
  const current = ++generation;
  busy.value = true;
  error.value = '';
  try {
    const result = await requestClient.get<{items: ErrorEntry[]; total: number; health: Health | null}>('/system/error-logs', {params: {
      page: page.value, page_size: 20, keyword: keyword.value, path: path.value,
      status: status.value ?? undefined,
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
function reset() { keyword.value = ''; path.value = ''; status.value = undefined; dates.value = undefined; search(); }
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
async function copy() {
  if (!selected.value) return;
  try { await navigator.clipboard.writeText(JSON.stringify(selected.value, null, 2)); ElMessage.success('已复制脱敏日志'); }
  catch { ElMessage.warning('复制失败，请手动选择详情文字复制'); }
}
onMounted(load);
</script>

<template>
  <Page title="错误日志">
    <ElAlert title="记录 HTTP 500～599 和后台任务异常；默认保留30天。日志已脱敏，异常详情保留栈帧，不包含请求正文和局部变量。" type="info" :closable="false" class="mb-4" />
    <ElAlert v-if="error" :title="error" type="error" show-icon :closable="false" class="mb-4" />
    <ElAlert v-if="degraded" :title="`当前进程累计：数据库写入/清理失败 ${health?.databaseFailures} 次，文件操作失败 ${health?.fileFailures} 次，入库队列溢出 ${health?.queueDrops} 条。数据库列表可能不完整，请检查文件日志。`" type="warning" :closable="false" class="mb-4" />
    <ElCard>
      <div class="filters">
        <ElInput v-model="keyword" placeholder="错误原因 / 异常类型 / 请求或任务编号" clearable aria-label="关键词" @keyup.enter="search" />
        <ElInput v-model="path" placeholder="接口路径或任务类型" clearable aria-label="接口路径" @keyup.enter="search" />
        <ElInputNumber v-model="status" :min="500" :max="599" :precision="0" :controls="false" placeholder="状态码" aria-label="状态码" />
        <ElDatePicker v-model="dates" type="datetimerange" start-placeholder="开始时间" end-placeholder="结束时间" />
        <ElButton type="primary" :loading="busy" @click="search">查询</ElButton>
        <ElButton @click="reset">重置</ElButton>
        <ElButton :disabled="busy" @click="load">刷新</ElButton>
      </div>
      <ElTable v-loading="busy" :data="rows" empty-text="暂无符合条件的错误日志">
        <ElTableColumn label="发生时间" width="180"><template #default="{row}">{{ formattedTime(row.created) }}</template></ElTableColumn>
        <ElTableColumn label="状态" width="90"><template #default="{row}"><ElTag type="danger">{{ row.status }}</ElTag></template></ElTableColumn>
        <ElTableColumn label="来源" width="90"><template #default="{row}">{{ row.source === 'task' ? '后台任务' : row.method }}</template></ElTableColumn>
        <ElTableColumn prop="path" label="接口 / 任务" min-width="180" show-overflow-tooltip />
        <ElTableColumn prop="message" label="错误原因" min-width="240" show-overflow-tooltip />
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
          <pre>{{ selected.message }}</pre>
          <h3>异常堆栈</h3>
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
.filters > :deep(.el-input-number) { width: 130px; }
.filters > :deep(.el-date-editor) { max-width: 100%; }
.storage-hint { color: var(--el-text-color-secondary); font-size: 12px; margin-top: 16px; overflow-wrap: anywhere; }
.detail-content { min-height: 100px; overflow-wrap: anywhere; }
.detail-content p { margin-bottom: 8px; }
.detail-content h3 { margin: 16px 0 8px; font-weight: 600; }
.detail-content pre { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--el-fill-color-light); border-radius: 6px; padding: 12px; max-height: 420px; overflow: auto; }
</style>
