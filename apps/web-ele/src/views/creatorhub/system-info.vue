<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { ElAlert, ElButton, ElCard, ElDescriptions, ElDescriptionsItem, ElEmpty, ElTable, ElTableColumn, ElTag } from 'element-plus';
import { requestClient } from '#/api/request';

type ProbeStatus = 'available' | 'partial' | 'unavailable' | 'error' | 'timeout';
interface Report {
  scope: 'backend';
  hostname: string;
  system: string;
  release: string;
  os_name?: string | null;
  kernel_version?: string;
  architecture: string;
  collected_at: number;
  cpu: { model: string | null; physical_cores: number | null; logical_cores: number | null; status: ProbeStatus; detail: string };
  memory?: { total_mib: number | null; used_mib: number | null; available_mib: number | null; usage_percent: number | null; status: ProbeStatus; detail: string };
  gpu: { status: ProbeStatus; detail: string; devices: { name: string; memory_mib: number | null; memory_used_mib?: number | null; memory_free_mib?: number | null; memory_usage_percent?: number | null; driver: string | null }[] };
}
const report = ref<Report | null>(null);
const loading = ref(false);
const error = ref('');
const osName = computed(() => report.value?.os_name || (report.value?.system === 'Linux'
  ? 'Linux（发行版未读取）' : report.value?.system) || '未读取');
const kernelVersion = computed(() => report.value?.kernel_version
  ?? (report.value?.system === 'Linux' ? report.value.release : null));
const labels: Record<ProbeStatus, string> = { available: '已读取', partial: '部分信息', unavailable: '未取得信息', error: '查询失败', timeout: '查询超时' };
const colors = { available: 'success', partial: 'warning', unavailable: 'info', error: 'danger', timeout: 'warning' } as const;
const display = (value: string | number | null | undefined) => value ?? '未读取';
const memory = (value: number | null | undefined) => typeof value !== 'number' || !Number.isFinite(value) || value < 0
  ? '未读取' : `${(value / 1024).toFixed(2)} GiB（${Number(value.toFixed(2))} MiB）`;
const percent = (value: number | null | undefined) => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100
  ? '未读取' : `${value.toFixed(2)}%`;
let disposed = false;

async function load() {
  if (loading.value || disposed) return;
  loading.value = true;
  error.value = '';
  try {
    // Windows 最多依次探测四项，每项上限3秒，为部分结果预留网络时间。
    const result = await requestClient.get<Report>('/system/system-info', { timeout: 20000 });
    if (!disposed) report.value = result;
  } catch {
    if (!disposed) error.value = report.value
      ? '刷新失败，当前仍显示上次采集结果，请稍后重试。'
      : '系统信息读取失败，请确认后端已更新且当前账号有查看权限。';
  } finally {
    if (!disposed) loading.value = false;
  }
}
onMounted(load);
onBeforeUnmount(() => { disposed = true; });
</script>

<template>
  <Page title="系统信息" description="查看当前后端服务器的 CPU、运行内存和 GPU 信息">
    <ElAlert class="mb-4" :closable="false" type="info" show-icon
      title="显示的是处理本次请求的后端服务器，非浏览器电脑或工作节点。虚拟机、WSL、容器显示其可见硬件；设备信息不代表模型推理已验证可用。" />
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <ElButton type="primary" :loading="loading" @click="load">刷新信息</ElButton>
      <span v-if="report" class="text-sm text-muted-foreground">采集时间：{{ new Date(report.collected_at * 1000).toLocaleString() }}</span>
      <span class="text-sm text-muted-foreground">进入页面时读取，之后手动刷新；不运行压力测试。</span>
    </div>
    <ElAlert v-if="error" class="mb-4" :closable="false" type="error" show-icon :title="error" />
    <template v-if="report">
      <ElCard class="mb-4" header="后端运行环境" shadow="never">
        <ElDescriptions :column="1" border>
          <ElDescriptionsItem label="主机名称">{{ display(report.hostname) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="操作系统">{{ osName }}</ElDescriptionsItem>
          <ElDescriptionsItem label="内核版本">{{ display(kernelVersion) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="系统架构">{{ display(report.architecture) }}</ElDescriptionsItem>
        </ElDescriptions>
      </ElCard>
      <ElCard class="hardware-card cpu-card mb-4" shadow="never">
        <template #header><span class="hardware-title mr-3">CPU 信息</span><ElTag :type="colors[report.cpu.status]">{{ labels[report.cpu.status] }}</ElTag></template>
        <ElDescriptions :column="1" border>
          <ElDescriptionsItem label="CPU 型号"><span :class="{ 'hardware-value': report.cpu.model }">{{ display(report.cpu.model) }}</span></ElDescriptionsItem>
          <ElDescriptionsItem label="物理核心数（系统报告）"><span :class="{ 'hardware-value': report.cpu.physical_cores }">{{ display(report.cpu.physical_cores) }}</span></ElDescriptionsItem>
          <ElDescriptionsItem label="逻辑线程数"><span :class="{ 'hardware-value': report.cpu.logical_cores }">{{ display(report.cpu.logical_cores) }}</span></ElDescriptionsItem>
        </ElDescriptions>
        <p class="mt-3 text-sm text-muted-foreground">{{ report.cpu.detail }}</p>
      </ElCard>
      <ElCard class="mb-4" shadow="never">
        <template #header><span class="mr-3">运行内存</span><ElTag v-if="report.memory" :type="colors[report.memory.status]">{{ labels[report.memory.status] }}</ElTag></template>
        <ElDescriptions :column="1" border>
          <ElDescriptionsItem label="内存总量">{{ memory(report.memory?.total_mib) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="已用内存">{{ memory(report.memory?.used_mib) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="可用内存">{{ memory(report.memory?.available_mib) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="内存使用率">{{ percent(report.memory?.usage_percent) }}</ElDescriptionsItem>
        </ElDescriptions>
        <p class="mt-3 text-sm text-muted-foreground">{{ report.memory?.detail ?? '当前后端尚未返回运行内存信息，请更新后端后刷新。' }}</p>
      </ElCard>
      <ElCard class="hardware-card gpu-card" shadow="never">
        <template #header><span class="hardware-title mr-3">GPU 信息</span><ElTag :type="colors[report.gpu.status]">{{ labels[report.gpu.status] }}</ElTag></template>
        <ElTable v-if="report.gpu.devices.length" :data="report.gpu.devices" border>
          <ElTableColumn label="显卡型号" min-width="240"><template #default="{ row }"><span class="hardware-value">{{ row.name }}</span></template></ElTableColumn>
          <ElTableColumn label="显存总量" min-width="190"><template #default="{ row }"><span :class="{ 'hardware-value': row.memory_mib != null }">{{ memory(row.memory_mib) }}</span></template></ElTableColumn>
          <ElTableColumn label="已用显存" min-width="190"><template #default="{ row }">{{ memory(row.memory_used_mib) }}</template></ElTableColumn>
          <ElTableColumn label="剩余显存" min-width="190"><template #default="{ row }">{{ memory(row.memory_free_mib) }}</template></ElTableColumn>
          <ElTableColumn label="显存使用率" min-width="125"><template #default="{ row }">{{ percent(row.memory_usage_percent) }}</template></ElTableColumn>
          <ElTableColumn label="驱动版本" min-width="150"><template #default="{ row }">{{ display(row.driver) }}</template></ElTableColumn>
        </ElTable>
        <ElEmpty v-else :description="labels[report.gpu.status]" :image-size="60" />
        <p class="mt-3 text-sm text-muted-foreground">{{ report.gpu.detail }}</p>
        <p class="mt-2 text-sm text-muted-foreground">显存用量由 NVIDIA 驱动提供；其他设备无法可靠读取时显示“未读取”。使用率 = 已用 / 总量，驱动保留显存可能使已用与剩余之和不等于总量。</p>
      </ElCard>
    </template>
    <ElEmpty v-else-if="!loading && !error" description="暂无系统信息，请刷新重试" />
  </Page>
</template>

<style scoped>
.cpu-card {
  --hardware-accent: var(--el-color-primary);
  --hardware-tint: var(--el-color-primary-light-9);
}

.gpu-card {
  --hardware-accent: var(--el-color-success);
  --hardware-tint: var(--el-color-success-light-9);
}

.hardware-card {
  border-top: 3px solid var(--hardware-accent);
}

.hardware-card :deep(.el-card__header) {
  background-color: var(--hardware-tint);
}

.hardware-title {
  color: var(--hardware-accent);
  font-size: 16px;
  font-weight: 700;
}

.hardware-value {
  color: var(--hardware-accent);
  font-weight: 600;
}
</style>
