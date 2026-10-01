<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { ElAlert, ElButton, ElDialog, ElPagination, ElTable, ElTableColumn } from 'element-plus';
import { requestClient } from '#/api/request';
import AppDatePicker from '#/components/app-date-picker.vue';
import CopyValue from '#/components/copy-value.vue';

const props=defineProps<{openid:string;modelValue:boolean}>();
const emit=defineEmits<{ 'update:modelValue':[value:boolean] }>();
type LoginRecord={id:string;ip:string|null;region:string|null;method:string;created:number};
const rows=ref<LoginRecord[]>([]),total=ref(0),page=ref(1),busy=ref(false),error=ref('');
const dates=ref<[Date,Date]|null>(null);
let version=0;
async function load(){
 if(!props.modelValue||!props.openid)return;
 const current=++version;busy.value=true;error.value='';rows.value=[];
 try{
  const data=await requestClient.get<{items:LoginRecord[];total:number}>(`/operations/users/${encodeURIComponent(props.openid)}/login-records`,{params:{page:page.value,start:dates.value?Math.floor(dates.value[0].getTime()/1000):0,end:dates.value?Math.floor(dates.value[1].getTime()/1000):0}});
  if(current===version){rows.value=data.items;total.value=data.total;}
 }catch(e){if(current===version){error.value=e instanceof Error?e.message:'登录记录加载失败';total.value=0;}}
 finally{if(current===version)busy.value=false;}
}
function search(){page.value=1;void load();}
watch(()=>[props.modelValue,props.openid],()=>{
 version++;rows.value=[];total.value=0;error.value='';busy.value=false;page.value=1;dates.value=null;
 if(props.modelValue)void load();
},{immediate:true});
onBeforeUnmount(()=>{version++;});
</script>

<template>
 <ElDialog :model-value="modelValue" title="登录记录" width="min(900px,94vw)" destroy-on-close @update:model-value="emit('update:modelValue',$event)">
  <div class="mb-4">用户：<CopyValue :value="openid" label="复制用户 OpenId" /></div>
  <div class="mb-4 flex flex-wrap gap-2"><AppDatePicker v-model="dates" type="datetimerange" start-placeholder="登录开始时间" end-placeholder="登录结束时间" @change="search" /><ElButton :loading="busy" @click="load">刷新</ElButton></div>
  <ElAlert v-if="error" :title="error" type="error" class="mb-3" :closable="false" />
  <ElTable v-loading="busy" :data="rows" row-key="id" border empty-text="暂无登录记录">
   <ElTableColumn label="登录 IP" min-width="220"><template #default="{row}"><CopyValue :value="row.ip" label="复制登录 IP" /></template></ElTableColumn>
   <ElTableColumn label="IP 归属地" min-width="220" show-overflow-tooltip><template #default="{row}">{{row.region||'未知'}}</template></ElTableColumn>
   <ElTableColumn label="登录方式" min-width="140"><template #default="{row}">{{row.method==='wechat'?'微信登录':row.method==='development'?'本地开发登录':row.method}}</template></ElTableColumn>
   <ElTableColumn label="登录时间" min-width="180"><template #default="{row}">{{new Date(row.created*1000).toLocaleString('zh-CN')}}</template></ElTableColumn>
  </ElTable>
  <ElPagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next, jumper" class="mt-4" @current-change="load" />
 </ElDialog>
</template>
