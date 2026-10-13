<script setup lang="ts">
import { onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { ElAlert, ElButton, ElCard, ElDialog, ElInput, ElOption, ElPagination, ElProgress, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus';
import { requestClient } from '#/api/request';
import { timingStages, formatSeconds } from '#/utils/worker-timings';
import WorkerHistoryDialog from './worker-history.vue';
import { adminRealtimeState, subscribeAdminEvents } from '#/services/admin-realtime';

type State = 'online' | 'offline' | 'disabled';
interface NodeEntry {
  id: string; name: string; enabled: boolean; created: number; status: State; busy: boolean;
  current_task: { id: string; kind: string; progress: number; started: number } | null;
  current_tasks?: NonNullable<NodeEntry["current_task"]>[];
  server_time?: number;
}
interface TimingEntry {
  task_id:string; kind:string; engine:string; input_bytes:number; width:number; height:number;
  duration:number; seconds:Record<string,number>; updated:number; status:string|null;
}
interface TimingListing {items:TimingEntry[];total:number;available:boolean}
const timingRows=ref<TimingEntry[]>([]);
const timingTotal=ref(0);
const timingPage=ref(1);
const timingAvailable=ref(true);
const timingError=ref('');
const taskState=(value:string|null)=>({queued:'排队中',running:'处理中',completed:'已完成',failed:'失败'})[value||'']||'—';
interface Summary { total: number; online: number; offline: number; disabled: number }
interface Listing { items: NodeEntry[]; total: number; summary: Summary; server_time: number }
const historyOpen=ref(false);
const historyNode=ref<NodeEntry>();
const rows = ref<NodeEntry[]>([]);
const summary = ref<Summary>();
const page = ref(1);
const total = ref(0);
const keyword = ref('');
const status = ref<State | ''>('');
const busy = ref(false);
const error = ref('');
const refreshed = ref(0);
const dialog = ref(false);
const selected = ref<NodeEntry>();
const selectedId = ref('');
const detailBusy = ref(false);
const detailError = ref('');
let generation = 0;
let detailGeneration = 0;
const labels: Record<State, string> = { online: '在线', offline: '离线', disabled: '已禁用' };
const cards: { key: keyof Summary; label: string }[] = [
  { key: 'total', label: '全部节点' }, { key: 'online', label: '在线节点' },
  { key: 'offline', label: '离线节点' }, { key: 'disabled', label: '已禁用' },
];
const formattedTime = (value: number) => value ? new Date(value * 1000).toLocaleString() : '—';
const taskName = (kind: string) => ({ 'audio.transcribe': '音视频转文字', 'demo.echo': '连接测试', 'image.watermark': '图片去水印', 'video.watermark': '视频去水印', 'video.subtitle': '视频去字幕' })[kind] || kind;
const currentTasks = (node: NodeEntry) => node.current_tasks ?? (node.current_task ? [node.current_task] : []);
const tagType = (state: State) => state === 'online' ? 'success' : state === 'disabled' ? 'warning' : 'info';
async function load() {
  const current = ++generation; busy.value = true; error.value = '';
  try {
    const result = await requestClient.get<Listing>('/system/worker-nodes', { params: {
      page: page.value, page_size: 20, keyword: keyword.value, status: status.value || undefined,
    } });
    if (current !== generation) return;
    rows.value = result.items; total.value = result.total; summary.value = result.summary; refreshed.value = result.server_time;
  } catch (cause) {
    if (current !== generation) return;
    error.value = cause instanceof Error ? cause.message : '读取节点状态失败，请检查服务连接与权限。';
    rows.value = []; total.value = 0; summary.value = undefined; refreshed.value = 0;
  } finally { if (current === generation) busy.value = false; }
}
function search() { page.value = 1; void load(); }
function reset() { keyword.value = ''; status.value = ''; search(); }
async function details(id: string) {
  const current = ++detailGeneration;
  if(selectedId.value!==id)timingPage.value=1;
  timingRows.value=[];timingTotal.value=0;timingError.value='';timingAvailable.value=true;
  selectedId.value = id; selected.value = undefined; detailError.value = ''; dialog.value = true; detailBusy.value = true;
  try {
    const result = await requestClient.get<NodeEntry>(`/system/worker-nodes/${encodeURIComponent(id)}`);
    if (current !== detailGeneration) return;
    selected.value = result;
    try {
      const report=await requestClient.get<TimingListing>(`/system/worker-nodes/${encodeURIComponent(id)}/timings`,{params:{page:timingPage.value,page_size:20}});
      if(current===detailGeneration){timingRows.value=report.items;timingTotal.value=report.total;timingAvailable.value=report.available;}
    } catch(cause) {
      if(current===detailGeneration)timingError.value=cause instanceof Error?cause.message:'耗时记录加载失败';
    }
  } catch (cause) {
    if (current === detailGeneration) detailError.value = cause instanceof Error ? cause.message : '节点详情读取失败';
  } finally { if (current === detailGeneration) detailBusy.value = false; }
}
let active = true;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const unsubscribe = subscribeAdminEvents((event) => {
  if (!active || !['ready', 'worker_nodes.changed'].includes(event)) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (!active) return;
    void load();
    if (dialog.value && selectedId.value) void details(selectedId.value);
  }, 200);
});
onMounted(load);
onActivated(() => { if (!active) { active = true; void load(); } });
onDeactivated(() => { active = false; clearTimeout(refreshTimer); });
onUnmounted(() => { active = false; unsubscribe(); clearTimeout(refreshTimer); });
const connectionLabels = { disconnected: '实时通知未连接', connecting: '实时通知连接中', connected: '实时通知已连接', reconnecting: '实时通知重连中' };
onUnmounted(() => { generation++; detailGeneration++; });
</script>

<template>
  <Page title="任务节点">
    <ElAlert title="在线状态依据节点会话与心跳判断，异常断网可能延迟约60秒显示离线。状态变化会自动刷新；服务端每5秒检查变化，异常断线判定后可能再延迟约5秒。" type="info" :closable="false" show-icon class="mb-4" />
    <div class="node-summary">
      <ElCard v-for="card in cards" :key="card.key" shadow="never" :class="`summary-${card.key}`">
        <span>{{ card.label }}</span><strong>{{ summary?.[card.key] ?? '—' }}</strong>
      </ElCard>
    </div>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon class="mb-4" />
    <ElCard>
      <div class="node-filters">
        <ElInput v-model="keyword" placeholder="搜索节点名称" aria-label="节点名称" clearable @keyup.enter="search" />
        <ElSelect v-model="status" placeholder="全部状态" aria-label="连接状态" clearable @change="search">
          <ElOption v-for="(label, value) in labels" :key="value" :label="label" :value="value" />
        </ElSelect>
        <ElButton type="primary" :loading="busy" @click="search">查询</ElButton>
        <ElButton :disabled="busy" @click="reset">重置</ElButton>
        <ElButton :loading="busy" @click="load">刷新状态</ElButton>
        <ElTag :type="adminRealtimeState === 'connected' ? 'success' : 'warning'">{{ connectionLabels[adminRealtimeState] }}</ElTag><span class="refresh-time">状态更新时间：{{ formattedTime(refreshed) }}</span>
      </div>
      <ElTable v-loading="busy" :data="rows" empty-text="暂无符合条件的任务节点">
        <ElTableColumn prop="name" label="节点名称" min-width="160" show-overflow-tooltip />
        <ElTableColumn prop="id" label="节点 ID" min-width="200" show-overflow-tooltip />
        <ElTableColumn label="连接状态" width="110"><template #default="{ row }"><ElTag :type="tagType(row.status)">{{ labels[row.status as State] }}</ElTag></template></ElTableColumn>
        <ElTableColumn label="处理状态" width="110"><template #default="{ row }">{{ row.busy ? '处理中（' + currentTasks(row as NodeEntry).length + '）' : row.status === 'online' ? '空闲' : '—' }}</template></ElTableColumn>
        <ElTableColumn label="当前任务" min-width="150"><template #default="{ row }">{{ currentTasks(row as NodeEntry).map(task => taskName(task.kind)).join('、') || '—' }}</template></ElTableColumn>
        <ElTableColumn label="创建时间" width="180"><template #default="{ row }">{{ formattedTime(row.created) }}</template></ElTableColumn>
        <ElTableColumn label="操作" width="180" fixed="right"><template #default="{ row }"><ElButton type="primary" link @click="details(row.id)">详情</ElButton><ElButton type="primary" link @click="historyNode=row as NodeEntry;historyOpen=true">处理记录</ElButton></template></ElTableColumn>
      </ElTable>
      <ElPagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next, jumper" class="mt-4" @current-change="load" />
      <p class="node-note">顶部统计为全部节点数量，不随筛选条件变化。节点信息为上次刷新时的快照。</p>
    </ElCard>
    <ElDialog v-model="dialog" title="节点详情" width="min(680px, 94vw)">
      <div v-loading="detailBusy" class="node-detail">
        <ElAlert v-if="detailError" :title="detailError" type="error" :closable="false" />
        <template v-if="selected">
          <dl>
            <dt>节点名称</dt><dd>{{ selected.name }}</dd>
            <dt>节点 ID</dt><dd>{{ selected.id }}</dd>
            <dt>连接状态</dt><dd><ElTag :type="tagType(selected.status)">{{ labels[selected.status] }}</ElTag></dd>
            <dt>启用状态</dt><dd>{{ selected.enabled ? '已启用' : '已禁用' }}</dd>
            <dt>处理状态</dt><dd>{{ selected.busy ? '处理中' : selected.status === 'online' ? '空闲' : '—' }}</dd>
            <dt>创建时间</dt><dd>{{ formattedTime(selected.created) }}</dd>
            <dt>状态更新时间</dt><dd>{{ formattedTime(selected.server_time || 0) }}</dd>
            <template v-for="task in currentTasks(selected)" :key="task.id">
              <dt>当前任务类型</dt><dd>{{ taskName(task.kind) }}</dd>
              <dt>当前任务 ID</dt><dd>{{ task.id }}</dd>
              <dt>处理进度</dt>
              <dd>
                <span v-if="task.kind === 'audio.transcribe'">处理中（暂不提供精确百分比）</span>
                <template v-else>
                  <ElProgress :percentage="Math.max(0, Math.min(100, task.progress))" />
                  <span class="task-progress-note">节点上报进度；下载、模型加载期间可能保持不变。</span>
                </template>
              </dd>
              <dt>任务开始时间</dt><dd>{{ formattedTime(task.started) }}</dd>
            </template>
          </dl>
          <h3 class="mb-3 mt-5 font-semibold">视频任务耗时分析</h3>
          <ElAlert title="展开任务查看各阶段耗时（秒）。阶段存在嵌套与并行，不能直接相加。统计是节点上报的诊断值，仅更新后的新任务有记录。" type="info" :closable="false" class="mb-3" />
          <ElAlert v-if="!timingAvailable" title="耗时表尚未迁移，请先审核并应用数据库变更。" type="warning" :closable="false" />
          <ElAlert v-if="timingError" :title="timingError" type="warning" :closable="false" />
          <ElTable v-if="timingAvailable" :data="timingRows" row-key="task_id" empty-text="暂无上报的耗时记录">
            <ElTableColumn type="expand"><template #default="{row}">
              <div class="px-4 py-2">
                <p class="mb-2">输入：{{ (row.input_bytes/1024/1024).toFixed(2) }} MB · {{ row.width }} × {{ row.height }} · {{ formatSeconds(row.duration) }} · {{ row.engine }}</p>
                <ElTable :data="timingStages(row.seconds)" size="small"><ElTableColumn prop="label" label="阶段" /><ElTableColumn prop="formatted" label="耗时" /></ElTable>
              </div>
            </template></ElTableColumn>
            <ElTableColumn prop="task_id" label="工作任务 ID" min-width="180" show-overflow-tooltip />
            <ElTableColumn label="类型" min-width="100"><template #default="{row}">{{ taskName(row.kind) }}</template></ElTableColumn>
            <ElTableColumn label="状态" width="90"><template #default="{row}">{{ taskState(row.status) }}</template></ElTableColumn>
            <ElTableColumn label="处理耗时" width="120"><template #default="{row}">{{ formatSeconds(row.seconds.processing_wall) }}</template></ElTableColumn>
            <ElTableColumn label="上报时间" width="180"><template #default="{row}">{{ formattedTime(row.updated) }}</template></ElTableColumn>
          </ElTable>
          <ElPagination v-if="timingTotal>20" v-model:current-page="timingPage" :total="timingTotal" :page-size="20" layout="total, prev, pager, next" class="mt-3" @current-change="details(selectedId)" />

        </template>
      </div>
      <template #footer><ElButton :loading="detailBusy" @click="details(selectedId)">刷新详情</ElButton><ElButton @click="dialog = false">关闭</ElButton></template>
    </ElDialog>
    <WorkerHistoryDialog v-if="historyNode" v-model="historyOpen" :node-id="historyNode.id" :node-name="historyNode.name" />
  </Page>
</template>

<style scoped>
.task-progress-note { color: var(--el-text-color-secondary); font-size: 12px; }
.node-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
.node-summary strong { display: block; margin-top: 8px; font-size: 28px; }
.summary-online strong { color: var(--el-color-success); }
.summary-offline strong { color: var(--el-text-color-secondary); }
.summary-disabled strong { color: var(--el-color-warning); }
.node-filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 16px; }
.node-filters .el-input { width: 240px; }
.node-filters .el-select { width: 150px; }
.node-filters .el-button + .el-button { margin-left: 0; }
.refresh-time, .node-note { color: var(--el-text-color-secondary); font-size: 12px; }
.node-note { margin-top: 14px; }
.node-detail { min-height: 120px; }
.node-detail dl { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 14px; }
.node-detail dt { color: var(--el-text-color-secondary); }
.node-detail dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 700px) { .node-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
