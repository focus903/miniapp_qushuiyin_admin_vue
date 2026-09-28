<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAccessStore } from '@vben/stores';
import {
  ElAlert, ElButton, ElCheckbox, ElDialog, ElMessage, ElMessageBox,
  ElOption, ElPagination, ElRadio, ElRadioGroup, ElSelect, ElTable, ElTableColumn, ElTabPane, ElTabs, ElTag,
} from 'element-plus';
import { requestClient } from '#/api/request';

interface Backup {
  id: string;
  kind: string;
  created: number;
  operator: string;
  status: string;
  size: number;
  format?: 'sql' | 'sql.gz';
  mode?: 'preserve' | 'rebuild';
  localReady?: boolean;
  protectionId?: string;
  target?: string;
  error: string;
  cloud?: { bucketCode: string; status: string } | null;
}
interface Status { items: Backup[]; busy: boolean; maintenance: boolean }
const access = useAccessStore();
const can = (action: string) => access.accessCodes.includes(`database:${action}`);
const state = ref<Status>({ items: [], busy: false, maintenance: false });
const buckets = ref<{ code: string; name: string }[]>([]);
const cloud = ref(false);
const compressed = ref(false);
const exportMode = ref<'preserve' | 'rebuild'>('rebuild');
const bucket = ref('');
const submitting = ref(false);
const loading = ref(false);
const importDialog = ref(false);
const selectedFile = ref<File>();
const inputKey = ref(0);
const tab = ref('backups');
const page = ref(1);
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
const rows = computed(() => state.value.items.filter((row) =>
  tab.value === 'backups' ? ['manual', 'before_import'].includes(row.kind) : !['manual', 'before_import'].includes(row.kind)));
const visibleRows = computed(() => rows.value.slice((page.value - 1) * 15, page.value * 15));
const disabled = computed(() => submitting.value || state.value.busy);
const kindNames: Record<string, string> = { manual: '手动备份', before_import: '导入前备份', import: '导入恢复', delete: '删除备份', resume: '解除维护' };
const statuses: Record<string, string> = { running: '执行中', success: '成功', failed: '失败', uploading: '上传中', deleted: '已删除' };
const size = (bytes: number) => bytes ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : '—';

async function load() {
  if (loading.value || disposed) return;
  loading.value = true;
  clearTimeout(timer);
  try {
    state.value = await requestClient.get<Status>('/database/backups');
    if (page.value > Math.max(1, Math.ceil(rows.value.length / 15))) page.value = 1;
  } finally {
    loading.value = false;
    if (!disposed) timer = setTimeout(() => void load().catch(() => {}), state.value.busy ? 2000 : 10000);
  }
}
function cloudCode() {
  if (cloud.value && !bucket.value) {
    ElMessage.warning('请选择私有存储桶');
    return null;
  }
  return cloud.value ? bucket.value : '';
}
async function backup() {
  const bucketCode = cloudCode();
  if (bucketCode === null) return;
  submitting.value = true;
  try {
    await requestClient.post('/database/backups', { bucketCode, format: compressed.value ? 'sql.gz' : 'sql', mode: exportMode.value });
    ElMessage.success('备份任务已提交');
    await load();
  } finally { submitting.value = false; }
}
async function download(row: Backup) {
  const blob = await requestClient.get<Blob>(`/database/backups/${row.id}/download`, {
    responseType: 'blob', responseReturn: 'body', timeout: 300_000,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `creatorhub-${row.id}.${row.format || 'sql'}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
async function confirmText(message: string, phrase: string) {
  try {
    await ElMessageBox.prompt(message, '确认操作', {
      inputPlaceholder: `请输入“${phrase}”`, confirmButtonText: '确认', cancelButtonText: '取消',
      inputValidator: (value) => value === phrase || `请输入“${phrase}”`,
    });
    return true;
  } catch { return false; }
}
async function remove(row: Backup) {
  if (!await confirmText(`将永久删除此备份的本地文件、云端文件和备份记录。编号：${row.id}`, '删除备份')) return;
  submitting.value = true;
  try {
    await requestClient.delete(`/database/backups/${row.id}`, { data: { confirm: '删除备份' } });
    ElMessage.success('删除任务已提交，请查看执行结果');
    await load();
  } finally { submitting.value = false; }
}
function selectFile(event: Event) {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0];
}
async function restore() {
  const file = selectedFile.value;
  const code = cloudCode();
  if (code === null) return;
  if (!file || !/\.(sql|sql\.gz|chdb)$/i.test(file.name) || file.size > 512 * 1024 * 1024 || !file.size) {
    ElMessage.warning('请选择不超过 512 MB 的 .sql 或 .sql.gz 备份文件（兼容旧 .chdb）');
    return;
  }
  if (!await confirmText('导入会覆盖现有数据库，包括管理员账号和配置。系统会先创建保护备份，恢复期间暂停业务。恢复后可能需要使用备份中的账号重新登录。', '覆盖数据库')) return;
  submitting.value = true;
  try {
    await requestClient.post('/database/imports', file, {
      timeout: 300_000,
      headers: { 'Content-Type': 'application/octet-stream', 'X-Database-Confirm': 'RESTORE', 'X-Backup-Bucket': code, 'X-Backup-Format': compressed.value ? 'sql.gz' : 'sql' },
    });
    importDialog.value = false;
    selectedFile.value = undefined;
    inputKey.value += 1;
    tab.value = 'history';
    page.value = 1;
    ElMessage.success('导入任务已提交，请等待校验和恢复结果');
    await load();
  } finally { submitting.value = false; }
}
async function resume() {
  if (!await confirmText('仅在确认数据库状态正常后解除维护。失败的导入记录及保护备份仍会保留。', '解除维护')) return;
  submitting.value = true;
  try {
    await requestClient.post('/database/maintenance/resume', { confirm: '解除维护' });
    await load();
  } finally { submitting.value = false; }
}
onMounted(async () => {
  await Promise.allSettled([load(), requestClient.get<{ code: string; name: string }[]>('/database/buckets').then((result) => { buckets.value = result; })]);
});
onBeforeUnmount(() => { disposed = true; clearTimeout(timer); });
</script>

<template>
  <div class="p-4">
    <ElAlert class="mb-4" type="info" :closable="false" title="备份包含数据库表结构和数据，不包含图片、视频等文件。仅支持恢复本模块导出的、与当前数据库结构及版本一致的备份。" />
    <ElAlert v-if="state.maintenance" class="mb-4" type="warning" :closable="false" title="数据库维护中：业务请求和后台任务已暂停。若导入失败，请查看操作记录，可重试导入或确认数据库状态后解除维护。" />
    <div v-if="can('backup')" class="mb-4 space-y-2">
      <div class="flex flex-wrap items-center gap-3"><span>导出方式</span>
        <ElRadioGroup v-model="exportMode" :disabled="disabled">
          <ElRadio value="preserve">保留表结构</ElRadio>
          <ElRadio value="rebuild">覆盖重建表（默认，同步表结构和数据）</ElRadio>
        </ElRadioGroup>
      </div>
      <p class="text-sm text-muted-foreground">保留表结构：仅同步数据，不同步已有表结构。已有表不重建，清空并恢复表内数据；适用于空库或结构完全一致的数据库，不会自动补字段。</p>
      <p class="text-sm text-amber-600">覆盖重建表（完整恢复备份内的表）：将表结构和数据同步为源库导出时的状态，不是持续实时同步。文件包含 DROP TABLE，使用服务器命令导入时会删除并重建备份中的表，再恢复数据；原表及数据会丢失，DDL 不能整体回滚。备份之外的表不会删除。</p>
      <p class="text-sm text-muted-foreground">选项仅影响新建备份。后台导入仍要求结构和版本一致，只恢复数据，不执行 DROP；跨结构恢复请停服、备份目标库后使用服务器导入命令。</p>
    </div>
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <ElCheckbox v-if="can('backup') || can('import')" v-model="compressed" :disabled="disabled">压缩为 .sql.gz</ElCheckbox>
      <ElCheckbox v-if="can('backup') || can('import')" v-model="cloud" :disabled="disabled">同时备份到云端</ElCheckbox>
      <ElSelect v-if="cloud" v-model="bucket" placeholder="选择私有存储桶" style="width: 220px" :disabled="disabled">
        <ElOption v-for="item in buckets" :key="item.code" :value="item.code" :label="item.name" />
      </ElSelect>
      <span v-if="cloud && !buckets.length" class="text-sm text-amber-600">请先在存储桶配置中添加并启用私有桶</span>
      <ElButton v-if="can('backup')" type="primary" :disabled="disabled || state.maintenance" @click="backup">创建备份</ElButton>
      <ElButton v-if="can('import')" :disabled="disabled" @click="importDialog = true">导入恢复</ElButton>
      <ElButton v-if="state.maintenance && can('import')" type="warning" :disabled="disabled" @click="resume">解除维护</ElButton>
      <ElButton :loading="loading" @click="load">刷新</ElButton>
      <ElTag v-if="state.busy" type="warning">数据库操作执行中</ElTag>
    </div>
    <ElTabs v-model="tab" @tab-change="page = 1">
      <ElTabPane label="备份记录" name="backups" />
      <ElTabPane label="操作记录" name="history" />
    </ElTabs>
    <ElTable :data="visibleRows" empty-text="暂无记录">
      <ElTableColumn label="时间" width="180"><template #default="{ row }">{{ new Date(row.created * 1000).toLocaleString() }}</template></ElTableColumn>
      <ElTableColumn label="类型" width="115"><template #default="{ row }">{{ kindNames[row.kind] || row.kind }}</template></ElTableColumn>
      <ElTableColumn prop="operator" label="操作人" width="110" show-overflow-tooltip />
      <ElTableColumn label="大小" width="110"><template #default="{ row }">{{ size(row.size) }}</template></ElTableColumn>
      <ElTableColumn v-if="tab === 'backups'" label="格式" width="95"><template #default="{ row }">{{ row.format || 'sql（转换）' }}</template></ElTableColumn>
      <ElTableColumn v-if="tab === 'backups'" label="导出方式" width="125"><template #default="{ row }"><ElTag :type="row.mode === 'rebuild' ? 'warning' : 'info'">{{ row.mode === 'rebuild' ? '覆盖重建表' : '保留表结构' }}</ElTag></template></ElTableColumn>
      <ElTableColumn label="状态" width="90"><template #default="{ row }"><ElTag :type="row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'">{{ statuses[row.status] || row.status }}</ElTag></template></ElTableColumn>
      <ElTableColumn label="云端" min-width="150" show-overflow-tooltip><template #default="{ row }">{{ row.cloud ? `${row.cloud.bucketCode} · ${statuses[row.cloud.status] || row.cloud.status}` : '—' }}</template></ElTableColumn>
      <ElTableColumn label="说明 / 编号" min-width="240" show-overflow-tooltip><template #default="{ row }">{{ row.error || (row.protectionId ? `保护备份：${row.protectionId}` : row.target || row.id) }}</template></ElTableColumn>
      <ElTableColumn v-if="tab === 'backups'" label="操作" width="160" fixed="right"><template #default="{ row }">
        <ElButton v-if="can('export') && row.localReady" link type="primary" :disabled="disabled" @click="download(row as Backup)">导出</ElButton>
        <ElButton v-if="can('delete')" link type="danger" :disabled="disabled || state.maintenance" @click="remove(row as Backup)">删除</ElButton>
      </template></ElTableColumn>
    </ElTable>
    <ElPagination v-model:current-page="page" class="mt-4" :page-size="15" :total="rows.length" layout="total, prev, pager, next" />
    <ElDialog v-model="importDialog" title="导入数据库备份" width="540px" :close-on-click-modal="!submitting" :close-on-press-escape="!submitting" :show-close="!submitting">
      <p class="mb-4">导入前会自动创建 {{ compressed ? '.sql.gz' : '.sql' }} 保护备份。{{ cloud ? '本次保护备份也会上传到所选云端存储桶。' : '本次保护备份仅保存在服务器本地。' }}</p>
      <p class="mb-4">请先等待视频任务完成。恢复会覆盖管理员、用户和业务配置，可能需要重新登录。</p>
      <input :key="inputKey" type="file" accept=".sql,.gz,.chdb" :disabled="submitting" @change="selectFile" />
      <template #footer><ElButton :disabled="submitting" @click="importDialog = false">取消</ElButton><ElButton type="danger" :loading="submitting" :disabled="!selectedFile || state.busy" @click="restore">校验并导入</ElButton></template>
    </ElDialog>
  </div>
</template>
