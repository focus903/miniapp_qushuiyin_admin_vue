<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';
import { ElAlert, ElAvatar, ElButton, ElCard, ElDescriptions, ElDescriptionsItem, ElDialog, ElInput, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTabPane, ElTabs, ElTag } from 'element-plus';
import { requestClient } from '#/api/request';
import AppDatePicker from '#/components/app-date-picker.vue';
import CopyValue from '#/components/copy-value.vue';

type Row={id:string|number;openid:string;nickname?:string;avatar_url?:string;source:string;status?:string;error?:string;created:number;updated?:number;finished?:number;text?:string};
type Result={items:Row[];total:number};
const access=useAccessStore();
const allowed=computed(()=>access.accessCodes.includes('transcripts:read'));
const kind=ref('transcripts'),page=ref(1),size=ref(20),total=ref(0);
const rows=ref<Row[]>([]),busy=ref(false),error=ref('');
const openid=ref(''),source=ref(''),status=ref('');
const dates=ref<[Date,Date]|null>(null);
const dialog=ref(false),detail=ref<Row|null>(null),detailBusy=ref(false),detailError=ref('');
const states:Record<string,string>={queued:'排队中',preparing:'准备中',running:'处理中',succeeded:'成功',failed:'失败',cancelled:'已取消'};
let listVersion=0,detailVersion=0,active=true;
const sourceName=(value:string)=>value==='upload'?'上传视频':value==='url'?'分享链接':value;
const time=(value?:number)=>value?new Date(value*1000).toLocaleString('zh-CN'):'—';
async function load(){
 const version=++listVersion;
 rows.value=[];total.value=0;error.value='';
 if(!allowed.value||!active){busy.value=false;return;}
 busy.value=true;
 try{
  const result=await requestClient.get<Result>(`/operations/records/${kind.value}`,{params:{page:page.value,page_size:size.value,openid:openid.value,source:source.value,...(kind.value==='text-tasks'?{status:status.value}:{}),start:dates.value?Math.floor(dates.value[0].getTime()/1000):0,end:dates.value?Math.floor(dates.value[1].getTime()/1000):0}});
  if(version===listVersion&&active&&allowed.value){rows.value=result.items;total.value=result.total;}
 }catch(e){if(version===listVersion)error.value=e instanceof Error?e.message:'记录加载失败';}
 finally{if(version===listVersion)busy.value=false;}
}
function search(){page.value=1;void load();}
async function openDetail(row:Row){
 if(!allowed.value||!active)return;
 const version=++detailVersion,resource=kind.value;
 dialog.value=true;detail.value=null;detailError.value='';detailBusy.value=true;
 try{
  const result=await requestClient.get<Row>(`/operations/records/${resource}/${encodeURIComponent(String(row.id))}`);
  if(version===detailVersion&&dialog.value&&active&&allowed.value)detail.value=result;
 }catch(e){if(version===detailVersion)detailError.value=e instanceof Error?e.message:'详情加载失败';}
 finally{if(version===detailVersion)detailBusy.value=false;}
}
function clearDetail(){detailVersion++;dialog.value=false;detail.value=null;detailError.value='';detailBusy.value=false;}
watch(dialog,value=>{if(!value)clearDetail();});
watch(kind,()=>{status.value='';clearDetail();search();});
watch(allowed,value=>{if(value)void load();else{listVersion++;rows.value=[];total.value=0;busy.value=false;clearDetail();}});
function stop(){active=false;listVersion++;busy.value=false;rows.value=[];clearDetail();}
onMounted(()=>void load());
onDeactivated(stop);onUnmounted(stop);
onActivated(()=>{if(!active){active=true;void load();}});
</script>

<template>
 <Page title="视频文案提取记录">
  <ElAlert v-if="!allowed" title="没有文案记录查看权限" type="warning" :closable="false" />
  <ElCard v-else>
   <ElTabs v-model="kind">
    <ElTabPane label="提取结果" name="transcripts" />
    <ElTabPane label="异步任务" name="text-tasks" />
   </ElTabs>
   <ElAlert class="mb-4" type="info" :closable="false" :title="kind==='transcripts'?'这里汇总分享链接和上传视频提取成功的文案，包括同步提取与异步提取结果。':'这里展示异步模式的排队、处理中、成功、失败及取消任务；同步提取不会生成此类任务记录。'" />
   <div class="mb-4 flex flex-wrap items-center gap-3">
    <ElInput v-model="openid" placeholder="完整 OpenId" clearable style="width:240px" @keyup.enter="search" />
    <ElSelect v-model="source" placeholder="全部来源" clearable style="width:150px"><ElOption label="分享链接" value="url" /><ElOption label="上传视频" value="upload" /></ElSelect>
    <ElSelect v-if="kind==='text-tasks'" v-model="status" placeholder="全部状态" clearable style="width:150px"><ElOption v-for="(label,value) in states" :key="value" :label="label" :value="value" /></ElSelect>
    <AppDatePicker v-model="dates" type="datetimerange" start-placeholder="创建开始时间" end-placeholder="创建结束时间" />
    <ElButton type="primary" :loading="busy" @click="search">查询</ElButton>
   </div>
   <ElAlert v-if="error" :title="error" type="error" class="mb-3" :closable="false" />
   <ElTable v-loading="busy" :data="rows" row-key="id" stripe border empty-text="暂无记录">
    <ElTableColumn label="头像" width="80"><template #default="{row}"><ElAvatar :size="44" :src="row.avatar_url||''">用户</ElAvatar></template></ElTableColumn>
    <ElTableColumn label="用户 OpenId" min-width="250"><template #default="{row}"><CopyValue :value="row.openid" label="复制用户 OpenId" /></template></ElTableColumn>
    <ElTableColumn label="昵称" width="130" show-overflow-tooltip><template #default="{row}">{{row.nickname||'未设置'}}</template></ElTableColumn>
    <ElTableColumn label="来源" width="110"><template #default="{row}">{{sourceName(row.source)}}</template></ElTableColumn>
    <ElTableColumn label="状态" width="100"><template #default="{row}"><ElTag :type="row.status==='failed'?'danger':row.status==='cancelled'?'info':!row.status||row.status==='succeeded'?'success':'warning'">{{kind==='transcripts'?'成功':states[row.status]||row.status}}</ElTag></template></ElTableColumn>
    <ElTableColumn v-if="kind==='text-tasks'" prop="error" label="错误原因" min-width="200" show-overflow-tooltip />
    <ElTableColumn label="创建时间" width="180"><template #default="{row}">{{time(row.created)}}</template></ElTableColumn>
    <ElTableColumn v-if="kind==='text-tasks'" label="完成时间" width="180"><template #default="{row}">{{time(row.finished)}}</template></ElTableColumn>
    <ElTableColumn label="操作" width="100" fixed="right"><template #default="{row}"><ElButton link type="primary" @click="openDetail(row as Row)">详情</ElButton></template></ElTableColumn>
   </ElTable>
   <ElPagination v-model:current-page="page" v-model:page-size="size" :total="total" :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next, jumper" class="mt-4 justify-center" @current-change="load" @size-change="search" />
  </ElCard>
  <ElDialog v-model="dialog" title="文案提取详情" width="min(900px,94vw)" destroy-on-close>
   <div v-loading="detailBusy" style="min-height:140px">
    <ElAlert v-if="detailError" :title="detailError" type="error" :closable="false" />
    <template v-if="detail">
     <ElDescriptions :column="2" border>
      <ElDescriptionsItem label="记录编号">{{detail.id}}</ElDescriptionsItem>
      <ElDescriptionsItem label="来源">{{sourceName(detail.source)}}</ElDescriptionsItem>
      <ElDescriptionsItem label="用户 OpenId"><CopyValue :value="detail.openid" label="复制用户 OpenId" /></ElDescriptionsItem>
      <ElDescriptionsItem label="昵称">{{detail.nickname||'未设置'}}</ElDescriptionsItem>
      <ElDescriptionsItem label="状态">{{detail.status?states[detail.status]||detail.status:'成功'}}</ElDescriptionsItem>
      <ElDescriptionsItem label="创建时间">{{time(detail.created)}}</ElDescriptionsItem>
      <ElDescriptionsItem v-if="detail.status" label="完成时间">{{time(detail.finished)}}</ElDescriptionsItem>
      <ElDescriptionsItem v-if="detail.error" label="错误原因">{{detail.error}}</ElDescriptionsItem>
     </ElDescriptions>
     <div class="my-3 flex items-center justify-between"><strong>提取文案</strong><CopyValue v-if="detail.text" :value="detail.text" label="复制文案全文">复制全文</CopyValue></div>
     <pre class="transcript-text">{{detail.text||'暂无文案结果'}}</pre>
    </template>
   </div>
  </ElDialog>
 </Page>
</template>

<style scoped>
.transcript-text { max-height:55vh; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.8; padding:16px; background:var(--el-fill-color-light); border-radius:6px; font-family:inherit; }
</style>
