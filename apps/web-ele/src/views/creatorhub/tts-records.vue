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
} from 'element-plus';

import { requestClient } from '#/api/request';
import CopyValue from '#/components/copy-value.vue';
import { ACCOUNT_TYPES } from '#/utils/account-type';

interface TtsRecord {
  id: string;
  openid: string;
  text: string;
  text_count: number;
  created: number;
  expires: number;
  audioUrl: string;
}
interface ListResult {
  items: TtsRecord[];
  total: number;
}

const rows = ref<TtsRecord[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const openid = ref('');
const development = ref('');
const keyword = ref('');
const dates = ref<[Date, Date]>();
const busy = ref(false);
const error = ref('');

const formattedTime = (value: number) =>
  value ? new Date(value * 1000).toLocaleString() : '—';

function queryParams(): Record<string, number | string | undefined> {
  return {
    page: page.value,
    page_size: pageSize.value,
    openid: openid.value.trim() || undefined,
    development: development.value || undefined,
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
    const result = await requestClient.get<ListResult>('/tts-records', {
      params: queryParams(),
    });
    rows.value = result.items ?? [];
    total.value = result.total ?? 0;
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : '读取配音记录失败，请检查数据库迁移。';
  } finally {
    busy.value = false;
  }
}

async function search() {
  page.value = 1;
  await load();
}

function reset() {
  openid.value = '';
  development.value = '';
  keyword.value = '';
  dates.value = undefined;
  void search();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Page title="配音记录">
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
          v-model="development"
          placeholder="账号类型"
          clearable
          aria-label="账号类型"
          @change="search"
        >
          <ElOption
            v-for="t in ACCOUNT_TYPES"
            :key="t.value"
            :label="t.label"
            :value="t.value"
          />
        </ElSelect>
        <ElInput
          v-model="keyword"
          placeholder="文案关键词"
          clearable
          aria-label="关键词"
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
        empty-text="暂无符合条件的配音记录"
      >
        <ElTableColumn label="生成时间" width="180">
          <template #default="{ row }">
            {{ formattedTime(row.created) }}
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
        <ElTableColumn label="文案" min-width="300">
          <template #default="{ row }">
            <span class="block truncate" :title="row.text">{{ row.text }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="字数" width="80">
          <template #default="{ row }">{{ row.text_count }}</template>
        </ElTableColumn>
        <ElTableColumn label="音频" width="90" fixed="right">
          <template #default="{ row }">
            <audio
              v-if="row.audioUrl"
              :src="row.audioUrl"
              controls
              preload="none"
            ></audio>
            <span v-else>—</span>
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
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.filters .el-input {
  width: 180px;
  min-width: 130px;
}

.filters .el-select {
  width: 130px;
  min-width: 110px;
}

.filters .el-date-editor.el-date-editor--datetimerange {
  width: 340px;
  min-width: 260px;
}
</style>
