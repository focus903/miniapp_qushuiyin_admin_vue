<script setup lang="ts">
import type { TableInstance } from 'element-plus';

import { computed, onMounted, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElCard,
  ElDatePicker,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';

import { requestClient } from '#/api/request';
import CopyValue from '#/components/copy-value.vue';

interface ClientLogEntry {
  id: number;
  openid: string;
  level: string;
  action: string;
  created: number;
}
interface ListResult {
  items: ClientLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

const access = useAccessStore();
const canDelete = computed(() =>
  access.accessCodes.includes('client-logs:delete'),
);
const table = ref<TableInstance>();
const checkedIds = ref<number[]>([]);
const deleting = ref(false);
const rows = ref<ClientLogEntry[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const level = ref('');
const openid = ref('');
const keyword = ref('');
const dates = ref<[Date, Date]>();
const busy = ref(false);
const error = ref('');
const formattedTime = (value: number) =>
  new Date(value * 1000).toLocaleString();

function levelType(value: string): 'danger' | 'info' | 'warning' {
  if (value === 'error') return 'danger';
  if (value === 'warning') return 'warning';
  return 'info';
}

function clearSelection() {
  checkedIds.value = [];
  table.value?.clearSelection();
}

function selectionChanged(entries: ClientLogEntry[]) {
  checkedIds.value = entries.map((entry) => entry.id);
}

const canSelect = () => !busy.value && !deleting.value;

watch([page, pageSize, level, openid, keyword, dates], clearSelection, {
  deep: true,
  flush: 'sync',
});

async function deleteLogs(values: number[]) {
  if (!canDelete.value || deleting.value || busy.value) return;
  const ids = [...new Set(values)];
  if (ids.length === 0) return;
  deleting.value = true;
  try {
    try {
      await ElMessageBox.confirm(
        `确定删除选中的 ${ids.length} 条客户端日志？删除后无法恢复。`,
        '删除客户端日志',
        {
          type: 'warning',
          confirmButtonText: '确认删除',
          cancelButtonText: '取消',
        },
      );
    } catch {
      return;
    }
    const result =
      ids.length === 1
        ? await requestClient.delete<{ deleted: number; requested: number }>(
            `/system/client-logs/${ids[0]}`,
          )
        : await requestClient.post<{ deleted: number; requested: number }>(
            '/system/client-logs/delete',
            { ids },
          );
    clearSelection();
    ElMessage.success(`已删除 ${result.deleted} 条日志`);
    await load();
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : '删除失败，请稍后重试',
    );
  } finally {
    deleting.value = false;
  }
}

function queryParams(): Record<string, number | string | undefined> {
  return {
    page: page.value,
    page_size: pageSize.value,
    level: level.value || undefined,
    openid: openid.value.trim() || undefined,
    keyword: keyword.value.trim() || undefined,
    start: dates.value?.[0]
      ? Math.floor(dates.value[0].getTime() / 1000)
      : undefined,
    end: dates.value?.[1]
      ? Math.floor(dates.value[1].getTime() / 1000)
      : undefined,
  };
}

async function clearAll() {
  if (!canDelete.value || deleting.value || busy.value) return;
  deleting.value = true;
  try {
    const levelOption = [
      { value: 'error', label: '错误' },
      { value: 'warning', label: '警告' },
      { value: 'info', label: '信息' },
      { value: 'debug', label: '调试' },
    ].find((item) => item.value === level.value);
    const scope = levelOption
      ? `全部「${levelOption.label}」级别客户端日志`
      : '全部客户端日志';
    try {
      await ElMessageBox.confirm(
        `确定清除${scope}？将删除所有匹配记录且无法恢复。`,
        '全部清除',
        {
          type: 'warning',
          confirmButtonText: '确认清除',
          cancelButtonText: '取消',
        },
      );
    } catch {
      return;
    }
    const result = await requestClient.post<{ deleted: number }>(
      '/system/client-logs/clear',
      { level: level.value || undefined },
    );
    page.value = 1;
    clearSelection();
    ElMessage.success(`已清除 ${result.deleted} 条日志`);
    await load();
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : '清除失败，请稍后重试',
    );
  } finally {
    deleting.value = false;
  }
}

async function load() {
  clearSelection();
  busy.value = true;
  error.value = '';
  try {
    const result = await requestClient.get<ListResult>('/system/client-logs', {
      params: queryParams(),
    });
    rows.value = result.items ?? [];
    total.value = result.total ?? 0;
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : '读取客户端日志失败，请检查数据库连接。';
  } finally {
    busy.value = false;
  }
}

function search() {
  page.value = 1;
  void load();
}
function reset() {
  level.value = '';
  openid.value = '';
  keyword.value = '';
  dates.value = undefined;
  search();
}
onMounted(() => {
  void load();
});
</script>

<template>
  <Page title="客户端日志">
    <ElCard>
      <div class="filters">
        <ElInput
          v-model="openid"
          placeholder="用户 openid"
          clearable
          aria-label="用户标识"
          @keyup.enter="search"
        />
        <ElSelect
          v-model="level"
          placeholder="全部级别"
          clearable
          aria-label="日志级别"
          @change="search"
        >
          <ElOption label="错误（error）" value="error" />
          <ElOption label="警告（warning）" value="warning" />
          <ElOption label="信息（info）" value="info" />
          <ElOption label="调试（debug）" value="debug" />
        </ElSelect>
        <ElInput
          v-model="keyword"
          placeholder="日志内容关键词"
          clearable
          aria-label="日志内容"
          @keyup.enter="search"
        />
        <ElDatePicker
          v-model="dates"
          type="datetimerange"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
        />
        <ElButton type="primary" :loading="busy" @click="search">查询</ElButton>
        <ElButton @click="reset">重置</ElButton>
        <ElButton :loading="busy" @click="load">刷新</ElButton>
      </div>
      <ElAlert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        class="mb-4"
      />
      <div v-if="canDelete" class="delete-toolbar">
        <ElButton
          type="danger"
          :disabled="busy || deleting || !checkedIds.length"
          :loading="deleting"
          @click="deleteLogs(checkedIds)"
        >
          批量删除
        </ElButton>
        <ElButton
          type="danger"
          plain
          :disabled="busy || deleting"
          :loading="deleting"
          @click="clearAll"
        >
          全部清除
        </ElButton>
        <span>已选择 {{ checkedIds.length }} 条</span>
      </div>
      <ElTable
        ref="table"
        v-loading="busy"
        :data="rows"
        row-key="id"
        empty-text="暂无符合条件的客户端日志"
        @selection-change="selectionChanged"
      >
        <ElTableColumn
          v-if="canDelete"
          type="selection"
          width="48"
          :selectable="canSelect"
        />
        <ElTableColumn label="发生时间" width="180">
          <template #default="{ row }">
            {{ formattedTime(row.created) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="级别" width="100">
          <template #default="{ row }">
            <ElTag :type="levelType(row.level)">
              {{ row.level }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="用户 openid" width="220">
          <template #default="{ row }">
            <CopyValue :value="row.openid" label="复制 openid">
              <span class="block truncate" :title="row.openid">{{
                row.openid
              }}</span>
            </CopyValue>
          </template>
        </ElTableColumn>
        <ElTableColumn label="内容" min-width="320">
          <template #default="{ row }">
            <CopyValue :value="row.action" label="复制日志内容">
              <span class="block truncate" :title="row.action">{{
                row.action
              }}</span>
            </CopyValue>
          </template>
        </ElTableColumn>
        <ElTableColumn v-if="canDelete" label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <ElButton
              link
              type="danger"
              :disabled="busy || deleting"
              @click="deleteLogs([row.id])"
            >
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElPagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        class="mt-4"
        @current-change="load"
        @size-change="search"
      />
    </ElCard>
  </Page>
</template>

<style scoped>
.delete-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.filters {
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.filters .el-input {
  width: 200px;
  min-width: 140px;
}

.filters .el-select {
  width: 150px;
  min-width: 120px;
}

.filters .el-date-editor.el-date-editor--datetimerange {
  width: 340px;
  min-width: 260px;
}
</style>
