<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAccessStore } from '@vben/stores';
import { ElAlert, ElButton, ElEmpty, ElMessage, ElProgress, ElTable, ElTableColumn, ElTag } from 'element-plus';
import { requestClient } from '#/api/request';

type Availability = 'available' | 'partial' | 'unavailable' | 'unknown';
interface Feature {
  key: string;
  name: string;
  backend: string;
  technology: string;
  mode: string;
  availability: Availability;
  scope: string;
  detail: string;
  advice: string;
}
interface Report {
  id?: string;
  node?: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'interrupted';
  started?: number;
  finished?: number;
  completed: number;
  total: number;
  current?: string;
  error?: string;
  features: Feature[];
  server?: {
    node: string;
    system: string;
    release: string;
    python: string;
    driverDetail: string;
    devices: { name: string; memoryMiB: string; driver: string }[];
  };
}
const access = useAccessStore();
const canRun = computed(() => access.accessCodes.includes('image-diagnostics:run'));
const report = ref<Report>({ status: 'idle', completed: 0, total: 8, features: [] });
const loading = ref(false);
const submitting = ref(false);
const loadError = ref(false);
const running = computed(() => report.value.status === 'running');
const progress = computed(() => Math.min(100, Math.round(report.value.completed / Math.max(1, report.value.total) * 100)));
const labels: Record<Availability, string> = { available: '可用 · 样本通过', partial: '部分环节通过', unavailable: '当前不可用 · 缺少环境', unknown: '未确认 / 检测失败' };
const colors: Record<Availability, 'success' | 'warning' | 'danger' | 'info'> = { available: 'success', partial: 'warning', unavailable: 'danger', unknown: 'info' };
const stateLabels = { idle: '尚未检测', running: '正在检测', completed: '检测完成', failed: '检测失败', interrupted: '检测中断' };
const summary = computed(() => (Object.keys(labels) as Availability[]).map((status) => ({
  status, title: labels[status], count: report.value.features.filter((item) => item.availability === status).length,
})));
const formattedTime = (value?: number) => value ? new Date(value * 1000).toLocaleString() : '—';
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
let expectedNode = '';
const nodeMismatch = ref(false);

async function load() {
  if (loading.value || disposed) return;
  loading.value = true;
  clearTimeout(timer);
  try {
    const next = await requestClient.get<Report>('/system/image-diagnostics');
    if (disposed) return;
    if (expectedNode && next.node !== expectedNode) {
      nodeMismatch.value = true;
      return;
    }
    nodeMismatch.value = false;
    expectedNode = next.node || expectedNode;
    report.value = next;
    loadError.value = false;
  } catch {
    if (!disposed) loadError.value = true;
  } finally {
    loading.value = false;
    if (!disposed && !loadError.value && !nodeMismatch.value && running.value) {
      timer = setTimeout(() => void load(), 2000);
    }
  }
}

async function start() {
  submitting.value = true;
  clearTimeout(timer);
  try {
    const task = await requestClient.post<{ id: string; node: string }>('/system/image-diagnostics');
    if (disposed) return;
    expectedNode = task.node;
    nodeMismatch.value = false;
    report.value = { id: task.id, node: task.node, status: 'running', current: '准备检测', completed: 0, total: 8, features: [] };
    ElMessage.success('检测已开始');
  } finally {
    submitting.value = false;
    if (!disposed) await load();
  }
}

onMounted(() => void load());
onBeforeUnmount(() => { disposed = true; clearTimeout(timer); });
</script>

<template>
  <div class="diagnostics">
    <div class="heading">
      <div>
        <h2>图像处理检测</h2>
        <p>查看当前后端服务器的图像、视频及转文字处理能力</p>
      </div>
      <div class="actions">
        <ElButton :loading="loading" :disabled="submitting" @click="load">刷新结果</ElButton>
        <ElButton v-if="canRun" type="primary" :loading="submitting" :disabled="running || loading || nodeMismatch" @click="start">
          {{ running ? '检测中' : '开始检测' }}
        </ElButton>
      </div>
    </div>
    <ElAlert :closable="false" type="info" show-icon title="检测会运行合成样本并短时占用 CPU / GPU。功能可用性与 GPU 加速分别判断；缺少依赖或模型不代表硬件不支持。" />
    <ElAlert v-if="loadError" class="notice" :closable="false" type="error" show-icon title="结果读取失败，当前内容可能不是最新状态。请点击刷新结果。" />
    <ElAlert v-if="nodeMismatch" class="notice" :closable="false" type="warning" show-icon title="请求被分配到另一台服务器。请通过固定节点地址或会话保持查看本次检测；此报告不代表整个集群。" />
    <ElAlert v-if="report.error" class="notice" :closable="false" type="error" show-icon :title="report.error" />
    <div class="panel">
      <div class="metadata">
        <span>节点：<strong>{{ report.server?.node || report.node || '—' }}</strong></span>
        <span>状态：{{ stateLabels[report.status] }}</span>
        <span>开始：{{ formattedTime(report.started) }}</span>
        <span>完成：{{ formattedTime(report.finished) }}</span>
      </div>
      <template v-if="report.server">
        <div class="server-line">系统：{{ report.server.system }} {{ report.server.release }} · Python：{{ report.server.python }}</div>
        <div v-for="device in report.server.devices" :key="device.name + device.memoryMiB" class="server-line">
          显卡：{{ device.name }} · 显存 {{ device.memoryMiB }} MiB · 驱动 {{ device.driver }}
        </div>
        <div class="server-line">{{ report.server.driverDetail }}</div>
      </template>
      <div v-if="running" class="notice">
        <div>正在检查：{{ report.current }}（模型检测每项最多 120 秒）</div>
        <ElProgress :percentage="progress" />
      </div>
    </div>
    <div v-if="report.features.length" class="summary">
      <div v-for="item in summary" :key="item.status" class="panel metric">
        <ElTag :type="colors[item.status]" effect="plain">{{ item.title }}</ElTag>
        <strong>{{ item.count }}</strong>
      </div>
    </div>
    <div class="panel">
      <ElTable v-if="report.features.length" :data="report.features" row-key="key" style="width: 100%">
        <ElTableColumn type="expand">
          <template #default="{ row }">
            <div class="details">
              <p><strong>验证范围：</strong>{{ row.scope }}</p>
              <pre>{{ row.detail }}</pre>
              <p><strong>建议：</strong>{{ row.advice }}</p>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="name" label="处理功能" min-width="195" />
        <ElTableColumn label="本系统是否可用" min-width="200">
          <template #default="{ row }"><ElTag :type="colors[row.availability as Availability]">{{ labels[row.availability as Availability] }}</ElTag></template>
        </ElTableColumn>
        <ElTableColumn prop="backend" label="处理引擎" min-width="145" />
        <ElTableColumn prop="technology" label="GPU 技术 / CPU 实现" min-width="245" />
        <ElTableColumn prop="mode" label="本次实际运行方式" min-width="160" />
      </ElTable>
      <ElEmpty v-else :description="running ? '正在检测，完成后展示全部功能结果' : '尚无检测结果，点击开始检测'" />
    </div>
    <p class="footnote">结果仅针对显示的服务器及检测时配置。展开每行可查看失败原因和验证范围；部分环节通过不代表完整视频任务已通过。</p>
  </div>
</template>

<style scoped>
.diagnostics { padding: 20px; }
.heading, .actions, .metadata { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.heading { justify-content: space-between; margin-bottom: 16px; }
.heading h2 { font-size: 20px; font-weight: 600; }
.heading p, .footnote, .server-line { color: hsl(var(--muted-foreground)); font-size: 13px; }
.heading p { margin-top: 6px; }
.panel { border: 1px solid hsl(var(--border)); background: hsl(var(--card)); border-radius: 8px; padding: 16px; margin-top: 16px; }
.metadata { gap: 12px 24px; font-size: 13px; }
.server-line { margin-top: 10px; overflow-wrap: anywhere; }
.notice { margin-top: 12px; }
.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.metric { display: flex; align-items: center; justify-content: space-between; }
.metric strong { font-size: 26px; }
.details { padding: 12px 24px; line-height: 1.8; }
.details pre { white-space: pre-wrap; overflow-wrap: anywhere; font-family: inherit; margin: 10px 0; }
.footnote { margin-top: 12px; }
</style>
