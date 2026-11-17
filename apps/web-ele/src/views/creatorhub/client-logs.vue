<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  ElAlert,
  ElButton,
  ElCard,
  ElDatePicker,
  ElInput,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';

import { requestClient } from '#/api/request';

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

async function load() {
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
      <ElTable
        v-loading="busy"
        :data="rows"
        row-key="id"
        empty-text="暂无符合条件的客户端日志"
      >
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
        <ElTableColumn
          label="用户 openid"
          width="220"
          prop="openid"
          show-overflow-tooltip
        />
        <ElTableColumn
          label="内容"
          prop="action"
          min-width="320"
          show-overflow-tooltip
        />
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
