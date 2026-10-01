<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';
import { ElAlert, ElButton, ElCard, ElCheckbox, ElDialog, ElForm, ElFormItem, ElInput, ElInputNumber, ElMessage, ElMessageBox, ElOption, ElPagination, ElProgress, ElSelect, ElTable, ElTableColumn, ElTag, ElTooltip, ElTabs, ElTabPane } from 'element-plus';
import CopyValue from '#/components/copy-value.vue';
import { requestClient } from '#/api/request';

type Kind = 'https' | 'xiaohongshu' | 'douyin';
const kindNames: Record<Kind, string> = { https: 'HTTPS连通', xiaohongshu: '小红书笔记', douyin: '抖音作品' };
interface Source { name: string; configured: boolean; account_key?: boolean; credential_source: string; business_proxy_enabled: boolean }
interface Entry {
  id: string; address: string; port: number; protocol: string; username?: string; password?: string; country: string; city: string; enabled: boolean;
  https_status: string; https_message: string; https_ms: number | null; https_checked: number;
  douyin_status: string; douyin_message: string; douyin_ms: number | null; douyin_checked: number;
  xiaohongshu_status: string; xiaohongshu_message: string; xiaohongshu_ms: number | null; xiaohongshu_checked: number;
}
interface CheckItem { proxy_id: string; address: string; port: number; status: string; message: string; elapsed_ms: number | null }
interface Job { source?: string; id: string; kind: Kind; status: string; total: number; completed: number; items: CheckItem[] }
interface Listing { items: Entry[]; total: number; checkable_total: number; active_job_id: string; failed_total: number }
interface PoolFilter { search: string; enabled?: boolean }
const access = useAccessStore();
const can = (action: string) => access.accessCodes.includes('proxy-pool:' + action);
type Platform = 'custom' | 'webshare' | 'kuaidaili';
const platform = ref<Platform>('custom');
const platformLabels:Record<Platform,string>={custom:'自定义代理',webshare:'Webshare',kuaidaili:'快代理'};
const platformName = computed(() => platformLabels[platform.value]);
const sourceInfo = ref<Source>();
const rows = ref<Entry[]>([]);
const total = ref(0);
const checkable = ref(0);
const failedTotal = ref(0);
const deleting = ref(false);
const customDialog=ref(false),importDialog=ref(false),savingCustom=ref(false),importing=ref(false);
const editingId=ref(''),importText=ref('');
type PreviewRow={line:number;valid:boolean;address?:string;port?:number;protocol?:string;authenticated?:boolean;duplicate?:boolean;error?:string};
const preview=ref<{rows:PreviewRow[];invalid:number;unique:number}|null>(null);
const blankCustom=()=>({address:'',port:8080,protocol:'http',username:'',password:'',clear_auth:false,country:'',city:'',enabled:true});
const customForm=ref(blankCustom());
watch(importText,()=>{preview.value=null;});
watch(customDialog,value=>{if(!value){customForm.value=blankCustom();editingId.value='';}});
watch(importDialog,value=>{if(!value){importText.value='';preview.value=null;}});
function clearCustom(){customDialog.value=false;importDialog.value=false;customForm.value=blankCustom();importText.value='';preview.value=null;editingId.value='';}
function openCustom(row?:Entry){
 if(platform.value!=='custom'||!can(row?'update':'create')||running.value||savingCustom.value||importing.value||deleting.value)return;
 editingId.value=row?.id||'';
 customForm.value={...blankCustom(),...(row?{address:row.address,port:row.port,protocol:row.protocol,country:row.country,city:row.city,enabled:row.enabled}:{})};
 customDialog.value=true;
}
async function saveCustom(){
 if(platform.value!=='custom'||!can(editingId.value?'update':'create')||savingCustom.value||running.value)return;
 const identity=editingId.value,version=loadVersion;
 const body={...customForm.value,username:customForm.value.username||(identity?null:''),password:customForm.value.password||(identity?null:'')};
 savingCustom.value=true;
 try{
  await requestClient.request(identity?'/proxy-pool/custom/'+identity:'/proxy-pool/custom',{method:identity?'PUT':'POST',data:body});
  if(!active.value||version!==loadVersion||platform.value!=='custom')return;
  customDialog.value=false;ElMessage.success('已保存自定义代理');await load(false);
 }catch{/* 接口统一提示。 */}finally{savingCustom.value=false;}
}
function openImport(){if(platform.value==='custom'&&can('create')&&!running.value&&!deleting.value&&!savingCustom.value){importText.value='';preview.value=null;importDialog.value=true;}}
async function importCustom(commit=false){
 if(platform.value!=='custom'||!can('create')||importing.value||running.value||!importText.value.trim())return;
 if(commit&&(!preview.value||preview.value.invalid))return;
 const text=importText.value,version=loadVersion;importing.value=true;
 try{
  const result=await requestClient.post<{rows:PreviewRow[];invalid:number;unique:number;imported:number;skipped:number}>('/proxy-pool/custom/import',{text,preview:!commit});
  if(!active.value||version!==loadVersion||platform.value!=='custom'||text!==importText.value)return;
  if(commit){importDialog.value=false;ElMessage.success(`新增 ${result.imported} 条，跳过重复 ${result.skipped} 条`);page.value=1;await load(false);}
  else preview.value=result;
 }catch{/* 接口统一提示。 */}finally{importing.value=false;}
}
const page = ref(1);
const pageSize = ref(20);
const search = ref('');
const enabled = ref('all');
const busy = ref(false);
const syncing = ref(false);
const submitting = ref(false);
const toggling = ref('');
const error = ref('');
const syncDialog = ref(false);
const sourceDialog = ref(false);
const detailsDialog = ref(false);
const syncLimit = ref(10);
const checkDialog = ref(false);
const checkKind = ref<Kind>('https');
const shareText = ref('');
const selectedIds = ref<string[]>();
const selectedProxyIds = ref<string[]>([]);
function selectProxies(entries: Entry[]) { selectedProxyIds.value = entries.filter(row => row.enabled).map(row => row.id); }
const selectableProxy = (row: Entry) => row.enabled;
const checkFilters = ref<PoolFilter>({ search: '' });
const appliedFilters = ref<PoolFilter>({ search: '' });
const selectedCount = ref(0);
const job = ref<Job>();
const visiblePasswords = ref<Record<string, boolean>>({});
const active = ref(true);
const running = computed(() => !!job.value && job.value.source === platform.value && ['queued', 'running'].includes(job.value.status));
const progress = computed(() => job.value?.total ? Math.round(job.value.completed / job.value.total * 100) : 0);
const statusNames: Record<string, string> = { untested: '未检测', queued: '排队中', running: '检测中', passed: '通过', failed: '失败', interrupted: '已中断', completed: '已完成' };
const statusName = (value: string) => statusNames[value] ?? value;
const tagType = (value: string) => value === 'passed' ? 'success' : value === 'failed' ? 'danger' : value === 'interrupted' ? 'warning' : 'info';
const timeText = (value: number) => value ? new Date(value * 1000).toLocaleString() : '—';
const filters = (): PoolFilter => ({ search: search.value.trim(), ...(enabled.value === 'all' ? {} : { enabled: enabled.value === 'enabled' }) });
let timer: ReturnType<typeof setTimeout> | undefined;
let loadVersion = 0;
let polling = false;

function stopPolling() { if (timer) clearTimeout(timer); timer = undefined; }
function schedule() {
  stopPolling();
  if (active.value && !document.hidden && running.value) timer = setTimeout(poll, 2500);
}
async function poll() {
  if (!active.value || document.hidden || !job.value || polling) return;
  polling = true;
  const identity = job.value.id;
  const pollVersion = loadVersion;
  const pollPlatform = platform.value;
  try {
    const value = await requestClient.get<Job>('/proxy-pool/check-jobs/' + identity);
    if (pollVersion !== loadVersion || pollPlatform !== platform.value) return;
    if (job.value?.id === identity && value.source === pollPlatform) job.value = value;
    if (active.value && !document.hidden) await load(false);
  } catch { if (pollVersion === loadVersion && pollPlatform === platform.value) error.value = '检测进度加载失败，可点击刷新重试。'; }
  finally { polling = false; schedule(); }
}
async function load(includeSource = true, applyDraft = false) {
  const sourceSnapshot = platform.value;
  const filterSnapshot = applyDraft ? filters() : { ...appliedFilters.value };
  const version = ++loadVersion;
  busy.value = true; error.value = '';
  try {
    if (includeSource) {
      const source = await requestClient.get<Source>('/proxy-pool/source', { params: { source: sourceSnapshot } });
      if (version !== loadVersion) return;
      sourceInfo.value = source;
    }
    const value = await requestClient.get<Listing>(can('sync') ? '/proxy-pool/proxies/credentials' : '/proxy-pool/proxies', {
      params: { source: sourceSnapshot, page: page.value, page_size: pageSize.value, ...filterSnapshot },
    });
    if (version !== loadVersion) return;
    appliedFilters.value = filterSnapshot;
    selectedProxyIds.value = [];
    rows.value = value.items; total.value = value.total; checkable.value = value.checkable_total; failedTotal.value = value.failed_total ?? 0;
    if (value.active_job_id && job.value?.id !== value.active_job_id) {
      const currentJob = await requestClient.get<Job>('/proxy-pool/check-jobs/' + value.active_job_id);
      if (version === loadVersion) job.value = currentJob.source === sourceSnapshot ? currentJob : undefined;
    } else if (!value.active_job_id && running.value) {
      job.value = undefined;
    }
  } catch { if (version === loadVersion) error.value = '代理池加载失败，请检查后端迁移和权限后重试。'; }
  finally { if (version === loadVersion) busy.value = false; schedule(); }
}
async function changePlatform() {
  clearCustom();stopPolling(); ++loadVersion;
  selectedProxyIds.value = [];
  rows.value = []; visiblePasswords.value = {}; sourceInfo.value = undefined;
  total.value = 0; checkable.value = 0; failedTotal.value = 0; page.value = 1; search.value = ''; enabled.value = 'all';
  appliedFilters.value = { search: '' }; job.value = undefined;
  checkDialog.value = false; syncDialog.value = false; sourceDialog.value = false; detailsDialog.value = false;
  shareText.value = ''; selectedIds.value = undefined;
  await load(true);
}
function applyFilter() { page.value = 1; void load(false, true); }
function openCheck(identity?: string | string[]) {
  if (!can('check') || deleting.value || running.value) return;
  selectedIds.value = Array.isArray(identity) ? [...identity] : identity ? [identity] : undefined;
  if (selectedIds.value && !selectedIds.value.length) return;
  selectedCount.value = selectedIds.value?.length ?? checkable.value;
  checkFilters.value = { ...appliedFilters.value }; shareText.value = ''; checkKind.value = 'https';
  checkDialog.value = true;
}
async function submitCheck() {
  if (!can('check') || deleting.value || submitting.value || running.value) return;
  if (checkKind.value !== 'https' && !shareText.value.trim()) { ElMessage.warning('请输入' + kindNames[checkKind.value] + '公开分享链接'); return; }
  submitting.value = true;
  const submitPlatform = platform.value;
  const submitVersion = loadVersion;
  try {
    const createdJob = await requestClient.post<Job>('/proxy-pool/check-jobs', {
      source: platform.value, kind: checkKind.value,
      ...(selectedIds.value ? { proxy_ids: [...selectedIds.value] } : { filters: { ...checkFilters.value } }),
      ...(checkKind.value !== 'https' ? { share_text: shareText.value.trim() } : {}),
    });
    if (!active.value || platform.value !== submitPlatform || loadVersion !== submitVersion) return;
    job.value = createdJob.source === submitPlatform ? createdJob : undefined;
    shareText.value = ''; checkDialog.value = false; schedule();
    ElMessage.success('已创建检测任务，关闭页面不会取消任务');
    await load(false);
  } catch { /* 接口统一提示，保留表单用于修正。 */ }
  finally { submitting.value = false; }
}
async function syncProxies() {
  if (!can('sync') || deleting.value || !sourceInfo.value?.configured || sourceInfo.value?.account_key || syncing.value) return;
  if (!Number.isInteger(syncLimit.value) || syncLimit.value < 1 || syncLimit.value > 100) { ElMessage.warning('获取数量须为1～100'); return; }
  syncing.value = true;
  try {
    const result = await requestClient.post<{ added: number; updated: number; skipped: number }>('/proxy-pool/sync', { source: platform.value, limit: syncLimit.value }, { timeout: 40000 });
    syncDialog.value = false;
    ElMessage.success(`新增 ${result.added} 条，更新 ${result.updated} 条，跳过 ${result.skipped} 条`);
    await load(false);
  } catch { /* 统一请求错误提示。 */ }
  finally { syncing.value = false; }
}
async function toggle(identity: string, currentEnabled: boolean) {
  if (!can('update') || deleting.value || toggling.value) return;
  toggling.value = identity;
  try { await requestClient.request('/proxy-pool/proxies/' + identity, { method: 'PATCH', data: { enabled: !currentEnabled } }); await load(false); }
  catch { /* 失败不改变本地开关。 */ }
  finally { toggling.value = ''; }
}
async function deleteProxies(row?: Entry) {
  if (!can('delete') || deleting.value || busy.value || running.value || submitting.value || syncing.value || toggling.value) return;
  if (!row && !failedTotal.value) return;
  const sourceSnapshot = platform.value;
  const version = loadVersion;
  const filterSnapshot = { ...appliedFilters.value };
  const label = platformLabels[sourceSnapshot];
  const description = row ? `删除 ${label} 的代理 ${row.address}:${row.port}？` : `删除 ${label} 当前筛选下全部分页中 HTTPS 连通检查失败的代理（当前 ${failedTotal.value} 条）？`;
  deleting.value = true;
  try {
    await ElMessageBox.confirm(description + ' 认证信息将清除，历史检测记录保留。重新获取代理时可能再次加入。', '确认删除', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' });
    if (!active.value || sourceSnapshot !== platform.value || version !== loadVersion) return;
    const result = row
      ? await requestClient.request<{ deleted: number }>('/proxy-pool/proxies/' + row.id, { method: 'DELETE', params: { source: sourceSnapshot } })
      : await requestClient.post<{ deleted: number }>('/proxy-pool/proxies/delete-failed', { source: sourceSnapshot, filters: filterSnapshot });
    if (!active.value || sourceSnapshot !== platform.value || version !== loadVersion) return;
    ElMessage.success(`已删除 ${result.deleted} 条代理`);
    page.value = 1; selectedProxyIds.value = []; visiblePasswords.value = {};
    await load(false);
  } catch { /* 取消不发送请求；接口错误由统一请求层提示。 */ }
  finally { deleting.value = false; }
}
function visibility() {
  stopPolling();
  if (!document.hidden && active.value) { if (running.value) void poll(); else void load(false); }
}
async function activate() {
  const returning = !active.value; active.value = true;
  if (returning) await load(false); else schedule();
}
function deactivate() { clearCustom(); selectedProxyIds.value = []; rows.value = []; visiblePasswords.value = {}; active.value = false; stopPolling(); ++loadVersion; busy.value = false; }
onMounted(() => { document.addEventListener('visibilitychange', visibility); void load(); });
onActivated(activate);
onDeactivated(deactivate);
onUnmounted(() => { deactivate(); shareText.value = ''; document.removeEventListener('visibilitychange', visibility); });
</script>

<template>
  <Page title="IP代理池">
    <ElCard shadow="never">
      <ElTabs v-model="platform" @tab-change="changePlatform">
        <ElTabPane label="自定义代理" name="custom" :disabled="syncing || submitting || !!toggling || deleting || savingCustom || importing" />
        <ElTabPane label="Webshare" name="webshare" :disabled="syncing || submitting || !!toggling || deleting || savingCustom || importing" />
        <ElTabPane label="快代理" name="kuaidaili" :disabled="syncing || submitting || !!toggling || deleting || savingCustom || importing" />
      </ElTabs>
      <ElAlert v-if="platform === 'kuaidaili' && sourceInfo?.account_key" title="当前配置为账户 API 密钥，不能提取代理。请开通试用或正式订单，并在 .env 配置对应订单 API 密钥后重启后端。" type="warning" :closable="false" class="mb-4" />
      <ElAlert title="代理池仅用于管理和检测，尚未用于小程序业务解析。检测结果只代表当前服务器、当前时间和目标。" type="info" :closable="false" class="mb-4" />
      <ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-4" />
      <div v-if="platform==='custom'" class="mb-3 flex gap-3">
        <ElButton v-if="can('create')" type="primary" :disabled="running || deleting || savingCustom || importing" @click="openCustom()">新增代理</ElButton>
        <ElButton v-if="can('create')" :disabled="running || deleting || savingCustom || importing" @click="openImport">批量导入</ElButton>
        <ElButton v-if="can('delete')" type="danger" plain :loading="deleting" :disabled="running || busy || savingCustom || importing || !failedTotal" @click="deleteProxies()">删除失效（{{ failedTotal }}）</ElButton>
      </div>
      <div class="toolbar">
        <ElInput v-model="search" placeholder="搜索 IP / 域名 / 国家 / 城市" clearable class="search" @keyup.enter="applyFilter" />
        <ElSelect v-model="enabled" class="state-filter" @change="applyFilter"><ElOption label="全部状态" value="all" /><ElOption label="已启用" value="enabled" /><ElOption label="已停用" value="disabled" /></ElSelect>
        <ElButton :loading="busy" @click="applyFilter">查询</ElButton>
        <ElButton v-if="platform!=='custom'" @click="sourceDialog = true">来源配置</ElButton>
        <ElButton v-if="platform!=='custom' && can('sync')" type="primary" :disabled="!sourceInfo?.configured || sourceInfo?.account_key" @click="syncDialog = true">获取代理</ElButton>
        <ElButton v-if="platform!=='custom' && can('check')" :disabled="deleting || running || busy || !selectedProxyIds.length" @click="openCheck(selectedProxyIds)">检查所选（{{ selectedProxyIds.length }}）</ElButton>
        <ElButton v-if="can('check')" :disabled="deleting || running || busy || !checkable || checkable > 100" @click="openCheck()">一键检查</ElButton>
        <ElButton v-if="platform!=='custom' && can('delete')" type="danger" plain :loading="deleting" :disabled="running || busy || submitting || syncing || !!toggling || !failedTotal" @click="deleteProxies()">一键删除失效（{{ failedTotal }}）</ElButton>
      </div>
      <p class="hint">{{ platformName }} 当前筛选有 {{ checkable }} 条已启用代理可检查，每批最多100条。基础连通通过不代表小红书或抖音作品可访问。三个来源独立检查，各自展示检测进度。</p>
      <div v-if="job && job.source === platform" class="job">
        <span>{{ platformLabels[job.source as Platform] }} · {{ kindNames[job.kind] }}：{{ statusName(job.status) }}（{{ job.completed }}/{{ job.total }}）</span>
        <ElProgress :percentage="progress" class="progress" />
        <ElButton link type="primary" @click="detailsDialog = true">查看结果</ElButton>
        <ElButton link @click="poll">刷新进度</ElButton>
      </div>
      <ElTable :data="rows" row-key="id" size="small" v-loading="busy" @selection-change="selectProxies">
        <ElTableColumn v-if="can('check')" type="selection" width="48" :selectable="selectableProxy" />
        <ElTableColumn label="IP / 域名" min-width="170"><template #default="{ row }"><CopyValue :value="row.address" label="复制地址" /></template></ElTableColumn>
        <ElTableColumn label="端口" width="100"><template #default="{ row }"><CopyValue :value="String(row.port)" label="复制端口" /></template></ElTableColumn>
        <ElTableColumn label="代理类型" width="110"><template #default="{ row }"><CopyValue :value="row.protocol?.toUpperCase()" label="复制代理类型" /></template></ElTableColumn>
        <ElTableColumn v-if="can('sync')" label="用户名" min-width="150"><template #default="{ row }"><CopyValue :value="row.username" label="复制用户名" /></template></ElTableColumn>
        <ElTableColumn v-if="can('sync')" label="密码" min-width="190"><template #default="{ row }"><CopyValue :value="row.password" label="复制密码"><span>{{ row.password ? (visiblePasswords[row.id] ? row.password : '••••••••') : '—' }}</span></CopyValue><ElButton v-if="row.password" link type="primary" @click="visiblePasswords[row.id] = !visiblePasswords[row.id]">{{ visiblePasswords[row.id] ? '隐藏' : '显示' }}</ElButton></template></ElTableColumn>
        <ElTableColumn label="地区" min-width="100" show-overflow-tooltip><template #default="{ row }">{{ row.country }} {{ row.city }}</template></ElTableColumn>
        <ElTableColumn label="状态" width="78"><template #default="{ row }"><ElTag size="small" :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</ElTag></template></ElTableColumn>
        <ElTableColumn label="HTTPS连通" min-width="135"><template #default="{ row }"><ElTooltip :content="row.https_message || '尚未检测'"><span><ElTag size="small" :type="tagType(row.https_status)">{{ statusName(row.https_status) }}</ElTag> <small v-if="row.https_ms !== null">{{ row.https_ms }}ms</small></span></ElTooltip></template></ElTableColumn>
        <ElTableColumn label="小红书笔记" min-width="135"><template #default="{ row }"><ElTooltip :content="row.xiaohongshu_message || '尚未检测'"><span><ElTag size="small" :type="tagType(row.xiaohongshu_status)">{{ statusName(row.xiaohongshu_status) }}</ElTag> <small v-if="row.xiaohongshu_ms !== null">{{ row.xiaohongshu_ms }}ms</small></span></ElTooltip></template></ElTableColumn>
        <ElTableColumn label="抖音作品" min-width="135"><template #default="{ row }"><ElTooltip :content="row.douyin_message || '尚未检测'"><span><ElTag size="small" :type="tagType(row.douyin_status)">{{ statusName(row.douyin_status) }}</ElTag> <small v-if="row.douyin_ms !== null">{{ row.douyin_ms }}ms</small></span></ElTooltip></template></ElTableColumn>
        <ElTableColumn label="最近检查" min-width="165"><template #default="{ row }">{{ timeText(Math.max(row.https_checked, row.xiaohongshu_checked, row.douyin_checked || 0)) }}</template></ElTableColumn>
        <ElTableColumn label="操作" :width="platform==='custom'?235:185" fixed="right"><template #default="{ row }"><ElButton v-if="platform==='custom' && can('update')" link type="primary" :disabled="running || savingCustom || importing || deleting" @click="openCustom(row as Entry)">编辑</ElButton><ElButton v-if="can('check')" link type="primary" :disabled="!row.enabled || running" @click="openCheck(row.id)">检查</ElButton><ElButton v-if="can('update')" link :loading="toggling === row.id" @click="toggle(row.id, row.enabled)">{{ row.enabled ? '停用' : '启用' }}</ElButton><ElButton v-if="can('delete')" link type="danger" :disabled="deleting || running || busy || submitting || syncing || !!toggling" @click="deleteProxies(row as Entry)">删除</ElButton></template></ElTableColumn>
      </ElTable>
      <ElPagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" :page-sizes="[20, 50, 100]" layout="total, sizes, prev, pager, next" class="mt-4" @current-change="load(false)" @size-change="applyFilter" />
    </ElCard>
    <ElDialog v-model="customDialog" :title="editingId?'编辑自定义代理':'新增自定义代理'" width="520px" :close-on-click-modal="!savingCustom" :show-close="!savingCustom">
      <ElForm label-width="90px" :disabled="savingCustom">
        <ElFormItem label="IP / 域名"><ElInput v-model="customForm.address" maxlength="253" placeholder="例如 proxy.example.com 或 8.8.8.8" /></ElFormItem>
        <ElFormItem label="端口"><ElInputNumber v-model="customForm.port" :min="1" :max="65535" :precision="0" /></ElFormItem>
        <ElFormItem label="协议"><ElSelect v-model="customForm.protocol"><ElOption label="HTTP" value="http" /><ElOption label="HTTPS" value="https" /><ElOption label="SOCKS5" value="socks5" /><ElOption label="SOCKS5H" value="socks5h" /></ElSelect></ElFormItem>
        <ElFormItem label="用户名"><ElInput v-model="customForm.username" autocomplete="off" :placeholder="editingId?'留空保留当前用户名':'可选'" :disabled="customForm.clear_auth" /></ElFormItem>
        <ElFormItem label="密码"><ElInput v-model="customForm.password" type="password" autocomplete="new-password" show-password :placeholder="editingId?'留空保留当前密码':'可选'" :disabled="customForm.clear_auth" /></ElFormItem>
        <ElFormItem v-if="editingId" label="认证"><ElCheckbox v-model="customForm.clear_auth">清除用户名和密码</ElCheckbox></ElFormItem>
        <ElFormItem label="国家代码"><ElInput v-model="customForm.country" maxlength="2" placeholder="可选，如 CN" /></ElFormItem>
        <ElFormItem label="城市"><ElInput v-model="customForm.city" maxlength="100" placeholder="可选" /></ElFormItem>
        <ElFormItem label="状态"><ElCheckbox v-model="customForm.enabled">启用</ElCheckbox></ElFormItem>
      </ElForm>
      <p class="hint">带认证的 SOCKS5 / SOCKS5H 支持 HTTPS 连通检查；浏览器的小红书、抖音检查暂不支持该认证方式。</p>
      <template #footer><ElButton :disabled="savingCustom" @click="customDialog=false">取消</ElButton><ElButton type="primary" :loading="savingCustom" @click="saveCustom">保存</ElButton></template>
    </ElDialog>
    <ElDialog v-model="importDialog" title="批量导入自定义代理" width="min(760px,94vw)" :close-on-click-modal="!importing" :show-close="!importing">
      <p class="hint">每行一条，最多500条。支持 IP或域名:端口，以及 http://、https://、socks5://、socks5h://用户名:密码@IP或域名:端口。未填协议默认 HTTP。用户名或密码中的特殊字符请使用 URL 编码；IPv6 请加方括号。重复记录跳过。</p>
      <ElInput v-model="importText" type="textarea" :rows="8" :disabled="importing" placeholder="请粘贴代理列表，先预览再导入" />
      <ElAlert v-if="preview" class="my-3" :type="preview.invalid?'warning':'success'" :closable="false" :title="`共 ${preview.rows.length} 行，${preview.invalid} 行错误，${preview.unique} 条去重后有效记录`" />
      <ElTable v-if="preview" :data="preview.rows" max-height="280"><ElTableColumn prop="line" label="行号" width="70" /><ElTableColumn prop="address" label="IP / 域名" /><ElTableColumn prop="port" label="端口" width="90" /><ElTableColumn prop="protocol" label="协议" width="95" /><ElTableColumn label="校验"><template #default="{row}">{{row.error||(row.duplicate?'重复，将跳过':row.authenticated?'有效（含认证）':'有效')}}</template></ElTableColumn></ElTable>
      <template #footer><ElButton :disabled="importing" @click="importDialog=false">取消</ElButton><ElButton :loading="importing" @click="importCustom(false)">预览校验</ElButton><ElButton type="primary" :loading="importing" :disabled="!preview||!!preview.invalid" @click="importCustom(true)">确认导入</ElButton></template>
    </ElDialog>
    <ElDialog v-model="sourceDialog" :title="platformName + ' 来源配置'" width="min(520px, 94vw)">
      <p>密钥：<ElTag :type="sourceInfo?.configured ? 'success' : 'warning'">{{ sourceInfo?.configured ? '已配置' : '未配置' }}</ElTag></p>
      <p class="hint">读取后端 .env 中的 {{ platform === 'kuaidaili' ? 'KUAIDAILI_SECRET_ID / KUAIDAILI_SECRET_KEY（订单密钥）' : 'WEBSHARE_API_KEY' }}，修改后需重启后端。本页面不展示或保存 API 密钥。</p>
      <p v-if="platform === 'webshare'" class="hint">获取按钮同步账号已有代理，实际额度以供应商账户为准。</p><p v-else class="hint">支持私密代理（DPS）和独享代理（KPS）订单；不自动开通订单或充值。提取可能消耗订单额度，短效代理应及时使用，已保存不代表仍在有效期内。</p>
      <template #footer><ElButton @click="load()">刷新配置状态</ElButton><ElButton @click="sourceDialog = false">关闭</ElButton></template>
    </ElDialog>
    <ElDialog v-model="syncDialog" title="获取代理" width="min(440px, 94vw)" :close-on-click-modal="!syncing">
      <ElForm label-position="top"><ElFormItem label="本次最多获取数量"><ElInputNumber v-model="syncLimit" :min="1" :max="100" :precision="0" /></ElFormItem></ElForm>
      <p class="hint">按当前平台获取，重复记录更新；不会删除未获取到的旧记录。快代理提取可能消耗订单额度，实际有效期以供应商为准。</p>
      <template #footer><ElButton :disabled="syncing" @click="syncDialog = false">取消</ElButton><ElButton type="primary" :loading="syncing" @click="syncProxies">获取</ElButton></template>
    </ElDialog>
    <ElDialog v-model="checkDialog" title="检查代理可用性" width="min(560px, 94vw)" @closed="shareText = ''">
      <p class="hint">{{ selectedIds ? '检查所选 ' + selectedIds.length + ' 条代理' : '检查当前筛选中的 ' + selectedCount + ' 条已启用代理（以提交时结果为准）' }}</p>
      <ElForm label-position="top">
        <ElFormItem label="检查类型"><ElSelect v-model="checkKind"><ElOption label="HTTPS连通" value="https" /><ElOption label="小红书笔记访问" value="xiaohongshu" /><ElOption label="抖音作品访问" value="douyin" /></ElSelect></ElFormItem>
        <ElFormItem v-if="checkKind !== 'https'" :label="kindNames[checkKind] + '分享内容'"><ElInput v-model="shareText" type="textarea" :rows="3" :maxlength="10000" :placeholder="'粘贴一条完整的' + kindNames[checkKind] + '分享内容'" /></ElFormItem>
      </ElForm>
      <p class="hint">检查会消耗代理流量；作品检查不下载完整媒体，通过仅表示该作品当时可读取，不代表媒体下载可用。</p>
      <template #footer><ElButton :disabled="submitting" @click="checkDialog = false">取消</ElButton><ElButton type="primary" :loading="submitting" @click="submitCheck">开始检查</ElButton></template>
    </ElDialog>
    <ElDialog v-model="detailsDialog" title="检测结果" width="min(780px, 96vw)">
      <ElTable :data="job?.items ?? []" size="small" max-height="480">
        <ElTableColumn label="代理" min-width="175"><template #default="{ row }">{{ row.address }}:{{ row.port }}</template></ElTableColumn>
        <ElTableColumn label="状态" width="90"><template #default="{ row }">{{ statusName(row.status) }}</template></ElTableColumn>
        <ElTableColumn label="原因" prop="message" min-width="200" show-overflow-tooltip />
        <ElTableColumn label="耗时" width="100"><template #default="{ row }">{{ row.elapsed_ms === null ? '—' : row.elapsed_ms + 'ms' }}</template></ElTableColumn>
      </ElTable>
    </ElDialog>
  </Page>
</template>

<style scoped>
.toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
.search { width:240px; } .state-filter { width:120px; }
.hint { margin:12px 0; color:var(--el-text-color-secondary); font-size:13px; line-height:1.6; }
.job { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin:16px 0; padding:12px; background:var(--el-fill-color-light); border-radius:6px; }
.progress { width:180px; } .address { font-family:monospace; }
</style>
