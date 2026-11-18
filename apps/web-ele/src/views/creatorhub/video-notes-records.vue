<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  ElAlert,
  ElButton,
  ElCard,
  ElDatePicker,
  ElDialog,
  ElInput,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';

import { requestClient } from '#/api/request';
import CopyValue from '#/components/copy-value.vue';
import { ACCOUNT_TYPES } from '#/utils/account-type';

interface NoteRecord {
  id: string;
  owner: string;
  kind: string;
  title: string;
  status: string;
  progress: number;
  message: string;
  created: number;
  updated: number;
}
interface NoteDetail extends NoteRecord {
  state: Record<string, unknown>;
  result: null | Record<string, unknown>;
}
interface ListResult {
  items: NoteRecord[];
  total: number;
}

const rows = ref<NoteRecord[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const owner = ref('');
const development = ref('');
const kind = ref('');
const status = ref('');
const keyword = ref('');
const dates = ref<[Date, Date]>();
const busy = ref(false);
const error = ref('');
const detailVisible = ref(false);
const detailBusy = ref(false);
const detail = ref<NoteDetail>();
const detailError = ref('');

const formattedTime = (value: number) =>
  value ? new Date(value * 1000).toLocaleString() : '—';

function kindLabel(value: string): string {
  if (value === 'report') return '笔记';
  if (value === 'subtitle') return '字幕笔记';
  return value || '—';
}

function statusType(value: string): 'danger' | 'info' | 'success' | 'warning' {
  if (value === 'completed') return 'success';
  if (value === 'failed') return 'danger';
  if (value === 'pending' || value === 'processing' || value === 'downloading')
    return 'warning';
  return 'info';
}

function queryParams(): Record<string, number | string | undefined> {
  return {
    page: page.value,
    page_size: pageSize.value,
    owner: owner.value.trim() || undefined,
    development: development.value || undefined,
    kind: kind.value || undefined,
    status: status.value.trim() || undefined,
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
  clearDetail();
  busy.value = true;
  error.value = '';
  try {
    const result = await requestClient.get<ListResult>(
      '/system/video-notes/records',
      {
        params: queryParams(),
      },
    );
    rows.value = result.items ?? [];
    total.value = result.total ?? 0;
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : '读取视频笔记记录失败，请检查数据库连接。';
  } finally {
    busy.value = false;
  }
}

function clearDetail() {
  detailVisible.value = false;
  detail.value = undefined;
  detailError.value = '';
}

async function search() {
  page.value = 1;
  await load();
}

function reset() {
  owner.value = '';
  development.value = '';
  kind.value = '';
  status.value = '';
  keyword.value = '';
  dates.value = undefined;
  void search();
}

async function openDetail(row: NoteRecord) {
  detailVisible.value = true;
  detailBusy.value = true;
  detailError.value = '';
  detail.value = undefined;
  try {
    detail.value = await requestClient.get<NoteDetail>(
      `/system/video-notes/records/${encodeURIComponent(row.id)}`,
    );
  } catch (caughtError) {
    detailError.value =
      caughtError instanceof Error ? caughtError.message : '详情读取失败';
  } finally {
    detailBusy.value = false;
  }
}

const noteText = computed(() => {
  const result = detail.value?.result;
  if (!result || typeof result !== 'object') return '';
  const value = (result as Record<string, unknown>).notes;
  return typeof value === 'string' ? value : '';
});

onMounted(() => {
  void load();
});
</script>

<template>
  <Page title="视频笔记记录">
    <ElCard>
      <div class="filters">
        <ElInput
          v-model="owner"
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
        <ElSelect
          v-model="kind"
          placeholder="全部类型"
          clearable
          aria-label="笔记类型"
          @change="search"
        >
          <ElOption label="笔记" value="report" />
          <ElOption label="字幕笔记" value="subtitle" />
        </ElSelect>
        <ElInput
          v-model="status"
          placeholder="状态"
          clearable
          aria-label="状态"
          @keyup.enter="search"
        />
        <ElInput
          v-model="keyword"
          placeholder="标题 / 消息关键词"
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
        empty-text="暂无符合条件的视频笔记记录"
      >
        <ElTableColumn label="创建时间" width="180">
          <template #default="{ row }">
            {{ formattedTime(row.created) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="用户 openid" width="220">
          <template #default="{ row }">
            <CopyValue :value="row.owner" label="复制 openid">
              <span class="block truncate" :title="row.owner">{{
                row.owner
              }}</span>
            </CopyValue>
          </template>
        </ElTableColumn>
        <ElTableColumn label="类型" width="110">
          <template #default="{ row }">{{ kindLabel(row.kind) }}</template>
        </ElTableColumn>
        <ElTableColumn label="标题" min-width="240">
          <template #default="{ row }">
            <span class="block truncate" :title="row.title">{{
              row.title
            }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="110">
          <template #default="{ row }">
            <ElTag :type="statusType(row.status)">{{ row.status }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="进度" width="90">
          <template #default="{ row }">{{ row.progress }}%</template>
        </ElTableColumn>
        <ElTableColumn label="消息" min-width="220">
          <template #default="{ row }">
            <span class="block truncate" :title="row.message">{{
              row.message
            }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <ElButton
              link
              type="primary"
              @click="openDetail(row as NoteRecord)"
            >
              详情
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

    <ElDialog
      v-model="detailVisible"
      title="视频笔记详情"
      width="min(820px, 94vw)"
    >
      <div v-loading="detailBusy" class="detail-content">
        <ElAlert
          v-if="detailError"
          :title="detailError"
          type="error"
          :closable="false"
        />
        <template v-if="detail">
          <p>用户：{{ detail.owner }}</p>
          <p>
            类型：{{ kindLabel(detail.kind) }} · 状态：{{ detail.status }} ·
            进度：{{ detail.progress }}%
          </p>
          <p>
            创建时间：{{ formattedTime(detail.created) }} · 更新时间：{{
              formattedTime(detail.updated)
            }}
          </p>
          <p>标题：{{ detail.title }}</p>
          <p v-if="detail.message">消息：{{ detail.message }}</p>
          <div v-if="noteText" class="detail-heading"><h3>笔记内容</h3></div>
          <pre v-if="noteText">{{ noteText }}</pre>
        </template>
      </div>
      <template #footer>
        <ElButton @click="detailVisible = false">关闭</ElButton>
      </template>
    </ElDialog>
  </Page>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: nowrap;
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

.detail-content {
  min-height: 80px;
  overflow-wrap: anywhere;
}

.detail-content p {
  margin-bottom: 8px;
}

.detail-heading h3 {
  margin: 16px 0 8px;
  font-weight: 600;
}

.detail-content pre {
  max-height: 420px;
  padding: 12px;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}
</style>
