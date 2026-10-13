<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElAlert, ElButton, ElDialog, ElInput, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus';
import { requestClient } from '#/api/request';
interface ImageRecord {
  id:string;openid:string;kind:string;status:string;created:number;finished:number;expires:number;duration_ms:number;
  input_width:number;input_height:number;input_size:number;result_size:number;result_width:number;result_height:number;error:string;storage_note:string;
  input_available:boolean;result_available:boolean;input_reason:string;result_reason:string;
  ocr_lines:string[];parameters:Record<string,unknown>;worker_task_id:string;
}
interface Preview extends ImageRecord { input_url:string;result_url:string }
const kinds:Record<string,string>={image_repair:'图片去水印',image_large:'图片高清',image_compress:'图片压缩',image_ocr:'图片文字识别'};
const paths:Record<string,string>={image_repair:'/creatorhub/image-records',image_large:'/creatorhub/image-records/large',image_compress:'/creatorhub/image-records/compress',image_ocr:'/creatorhub/image-records/ocr'};
const route=useRoute(),router=useRouter();
const routeKind=computed(()=>typeof route.meta.imageKind==='string'&&paths[route.meta.imageKind]?route.meta.imageKind:'image_repair');
const statuses:Record<string,string>={running:'处理中',completed:'成功',failed:'失败'};
const rows=ref<ImageRecord[]>([]);const page=ref(1);const total=ref(0);const kind=ref(routeKind.value);const status=ref('');const openid=ref('');
const busy=ref(false);const error=ref('');const dialog=ref(false);const detail=ref<Preview>();const previewBusy=ref(false);const previewError=ref('');
const inputFailed=ref(false);const resultFailed=ref(false);let generation=0;let previewGeneration=0;
const timeText=(value:number)=>value?new Date(value*1000).toLocaleString():'—';
const sizeText=(value:number)=>value?`${(value/1024/1024).toFixed(2)} MB`:'—';
async function load(){
  const current=++generation;busy.value=true;error.value='';
  try{const data=await requestClient.get<{items:ImageRecord[];total:number}>('/image-records',{params:{page:page.value,page_size:20,kind:kind.value||undefined,status:status.value||undefined,openid:openid.value.trim()||undefined}});
    if(current===generation){rows.value=data.items;total.value=data.total;}
  }catch(cause){if(current===generation){rows.value=[];total.value=0;error.value=cause instanceof Error?cause.message:'记录加载失败';}}
  finally{if(current===generation)busy.value=false;}
}
function search(){page.value=1;void load();}
function selectKind(value:string){if(paths[value])void router.push(paths[value]);}
function closePreview(){previewGeneration++;detail.value=undefined;previewBusy.value=false;previewError.value='';}
function mediaUrl(value:string){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?value:'';}catch{return '';}}
async function view(row:ImageRecord){
  const current=++previewGeneration;dialog.value=true;previewBusy.value=true;detail.value=undefined;previewError.value='';inputFailed.value=false;resultFailed.value=false;
  try{const data=await requestClient.post<Preview>(`/image-records/${encodeURIComponent(row.id)}/preview`,{});
    if(current===previewGeneration)detail.value={...data,input_url:mediaUrl(data.input_url),result_url:mediaUrl(data.result_url)};
  }catch(cause){if(current===previewGeneration)previewError.value=cause instanceof Error?cause.message:'详情加载失败';}
  finally{if(current===previewGeneration)previewBusy.value=false;}
}
watch(routeKind,(value)=>{kind.value=value;dialog.value=false;closePreview();search();});
onMounted(()=>void load());onBeforeUnmount(()=>{generation++;closePreview();});
</script>

<template>
  <div class="p-5">
    <ElAlert :title="`当前显示${kinds[kind]}记录。原图和结果默认保留12小时，可在系统管理 → 定时任务中分别调整；过期后保留业务记录和OCR文字。旧处理无法补录。`" type="info" :closable="false" class="mb-4" />
    <div class="filters">
      <ElSelect :model-value="kind" placeholder="选择图片功能" @change="selectKind"><ElOption v-for="(label,value) in kinds" :key="value" :label="label" :value="value" /></ElSelect>
      <ElSelect v-model="status" placeholder="全部状态" clearable @change="search"><ElOption v-for="(label,value) in statuses" :key="value" :label="label" :value="value" /></ElSelect>
      <ElInput v-model="openid" placeholder="用户OpenID（精确查询）" clearable @keyup.enter="search" />
      <ElButton type="primary" :loading="busy" @click="search">查询</ElButton><ElButton :loading="busy" @click="load">刷新</ElButton>
    </div>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-3" />
    <ElTable v-loading="busy" :data="rows" row-key="id" empty-text="暂无图片处理记录">
      <ElTableColumn prop="id" label="记录编号" min-width="150" show-overflow-tooltip />
      <ElTableColumn prop="openid" label="用户OpenID" min-width="160" show-overflow-tooltip />
      <ElTableColumn label="类型" width="125"><template #default="{row}">{{kinds[row.kind]||row.kind}}</template></ElTableColumn>
      <ElTableColumn label="状态" width="90"><template #default="{row}"><ElTag :type="row.status==='completed'?'success':row.status==='failed'?'danger':'warning'">{{statuses[row.status]||row.status}}</ElTag></template></ElTableColumn>
      <ElTableColumn label="原图大小" width="100"><template #default="{row}">{{sizeText(row.input_size)}}</template></ElTableColumn>
      <ElTableColumn label="结果大小" width="100"><template #default="{row}">{{sizeText(row.result_size)}}</template></ElTableColumn>
      <ElTableColumn label="耗时" width="90"><template #default="{row}">{{(row.duration_ms/1000).toFixed(2)}}秒</template></ElTableColumn>
      <ElTableColumn label="创建时间" width="175"><template #default="{row}">{{timeText(row.created)}}</template></ElTableColumn>
      <ElTableColumn label="操作" width="100" fixed="right"><template #default="{row}"><ElButton link type="primary" @click="view(row as ImageRecord)">查看详情</ElButton></template></ElTableColumn>
    </ElTable>
    <ElPagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next" class="mt-4" @current-change="load" />
    <ElDialog v-model="dialog" title="图片处理详情" width="min(1100px, 96vw)" destroy-on-close @closed="closePreview">
      <div v-loading="previewBusy">
        <ElAlert v-if="previewError" :title="previewError" type="error" :closable="false" />
        <template v-if="detail">
          <p>{{kinds[detail.kind]}} · {{statuses[detail.status]}} · {{timeText(detail.created)}}</p>
          <p class="my-2">用户：{{detail.openid}} · 素材保留至：{{timeText(detail.expires)}}</p>
          <p v-if="detail.worker_task_id" class="my-2">工作任务：{{detail.worker_task_id}}</p>
          <ElAlert v-if="detail.error||detail.storage_note" :title="[detail.error,detail.storage_note].filter(Boolean).join('；')" type="warning" :closable="false" class="mb-3" />
          <div class="image-grid">
            <section><h3>原图</h3><img v-if="detail.input_url&&!inputFailed" :src="detail.input_url" crossorigin="use-credentials" alt="原图" @error="inputFailed=true" /><p v-else>{{inputFailed?'图片加载失败，请重新打开详情':detail.input_reason}}</p></section>
            <section v-if="detail.kind!=='image_ocr'"><h3>处理结果</h3><img v-if="detail.result_url&&!resultFailed" :src="detail.result_url" crossorigin="use-credentials" alt="处理结果" @error="resultFailed=true" /><p v-else>{{resultFailed?'图片加载失败，请重新打开详情':detail.result_reason}}</p></section>
            <section v-else><h3>识别文字</h3><ElInput :model-value="detail.ocr_lines.join('\n')" type="textarea" :rows="14" readonly placeholder="暂无识别文字" /></section>
          </div>
          <p class="mt-3">处理参数：{{JSON.stringify(detail.parameters)}} · 原图尺寸：{{detail.input_width||'—'}} × {{detail.input_height||'—'}} · 结果尺寸：{{detail.result_width||'—'}} × {{detail.result_height||'—'}}</p>
        </template>
      </div>
    </ElDialog>
  </div>
</template>
<style scoped>
.filters{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}.filters .el-select{width:170px}.filters .el-input{width:280px}
.image-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.image-grid section{min-width:0}.image-grid h3{font-weight:600;margin-bottom:10px}.image-grid img{width:100%;height:55vh;object-fit:contain;background:var(--el-fill-color-light);border-radius:8px}.image-grid p{padding:30px;color:var(--el-text-color-secondary)}
@media(max-width:640px){.image-grid{grid-template-columns:1fr}}
</style>
