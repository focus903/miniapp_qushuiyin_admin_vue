<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { ElAlert, ElButton, ElDialog, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus';
import { requestClient } from '#/api/request';
import { timingStages, formatSeconds } from '#/utils/worker-timings';

interface RecordEntry {
  id:string;kind:string;status:string;progress:number;error:string;created:number;started:number;finished:number;attempts:number;
  engine:string|null;business_task_id:string|null;seconds:Record<string,number>|null;
  preview_allowed:boolean;input_available:boolean;result_available:boolean;input_reason:string;result_reason:string;
}
interface Preview {media_type?:'image'|'video';input_url:string;result_url:string;input_reason:string;result_reason:string;expires_at:number}
const props=defineProps<{modelValue:boolean;nodeId:string;nodeName:string}>();
const emit=defineEmits<{'update:modelValue':[value:boolean]}>();
const rows=ref<RecordEntry[]>([]);const page=ref(1);const total=ref(0);
const kind=ref('');const status=ref('');const busy=ref(false);const error=ref('');
const previewDialog=ref(false);const previewRow=ref<RecordEntry>();const preview=ref<Preview>();
const previewBusy=ref(false);const previewError=ref('');const inputFailed=ref(false);const resultFailed=ref(false);
let generation=0;let previewGeneration=0;
const kinds:Record<string,string>={'video.watermark':'视频去水印','video.subtitle':'视频去字幕','image.watermark':'图片去水印','audio.transcribe':'音视频转文字','demo.echo':'连接测试'};
const statuses:Record<string,string>={queued:'排队中',running:'处理中',completed:'已完成',failed:'失败或取消'};
const timeText=(value:number)=>value?new Date(value*1000).toLocaleString():'—';
const statusType=(value:string)=>value==='completed'?'success':value==='failed'?'danger':value==='running'?'warning':'info';
function clearPreview(){previewGeneration++;preview.value=undefined;previewRow.value=undefined;previewDialog.value=false;previewBusy.value=false;previewError.value='';}
async function load(){
  const current=++generation;busy.value=true;error.value='';
  try{
    const data=await requestClient.get<{items:RecordEntry[];total:number}>(`/system/worker-nodes/${encodeURIComponent(props.nodeId)}/tasks`,{params:{page:page.value,page_size:20,kind:kind.value||undefined,status:status.value||undefined}});
    if(current===generation){rows.value=data.items;total.value=data.total;}
  }catch(cause){if(current===generation){error.value=cause instanceof Error?cause.message:'处理记录加载失败';rows.value=[];total.value=0;}}
  finally{if(current===generation)busy.value=false;}
}
function search(){page.value=1;void load();}
function mediaUrl(value:string){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?value:'';}catch{return '';}}
async function openPreview(row:RecordEntry){
  if(!row.preview_allowed)return;
  const current=++previewGeneration;previewRow.value=row;preview.value=undefined;previewDialog.value=true;
  previewBusy.value=true;previewError.value='';inputFailed.value=false;resultFailed.value=false;
  try{
    const data=await requestClient.post<Preview>(`/system/worker-nodes/${encodeURIComponent(props.nodeId)}/tasks/${encodeURIComponent(row.id)}/preview`,{});
    if(current===previewGeneration)preview.value={...data,input_url:mediaUrl(data.input_url),result_url:mediaUrl(data.result_url)};
  }catch(cause){if(current===previewGeneration)previewError.value=cause instanceof Error?cause.message:'预览授权失败，请刷新记录后重试';}
  finally{if(current===previewGeneration)previewBusy.value=false;}
}
watch(()=>[props.modelValue,props.nodeId],()=>{
  generation++;clearPreview();rows.value=[];total.value=0;
  if(props.modelValue){page.value=1;kind.value='';status.value='';void load();}
},{immediate:true});
onBeforeUnmount(()=>{generation++;clearPreview();});
</script>

<template>
  <ElDialog :model-value="modelValue" :title="`${nodeName} · 处理记录`" width="min(1120px, 96vw)" @update:model-value="value=>emit('update:modelValue',value)">
    <ElAlert title="工作任务与业务任务的编号不同。新关联的视频和图片去水印任务可对照预览，素材默认保留12小时；过期或删除后不可预览。" type="info" :closable="false" class="mb-4" />
    <div class="history-filters">
      <ElSelect v-model="kind" placeholder="全部处理类型" clearable @change="search"><ElOption v-for="(label,value) in kinds" :key="value" :label="label" :value="value" /></ElSelect>
      <ElSelect v-model="status" placeholder="全部状态" clearable @change="search"><ElOption v-for="(label,value) in statuses" :key="value" :label="label" :value="value" /></ElSelect>
      <ElButton :loading="busy" @click="load">刷新记录</ElButton>
    </div>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-3" />
    <ElTable v-loading="busy" :data="rows" row-key="id" empty-text="该节点暂无符合条件的处理记录">
      <ElTableColumn type="expand"><template #default="{row}">
        <div class="px-5 py-3">
          <p>工作任务 ID：{{row.id}}</p><p>业务任务 ID：{{row.business_task_id||'旧记录未关联或此类型不适用'}}</p>
          <p>引擎：{{row.engine||'—'}} · 执行次数：{{row.attempts}}</p>
          <p v-if="row.error" class="mt-2 text-red-500">错误原因：{{row.error}}</p>
          <p class="my-2">原视频：{{row.input_available?'可预览':row.input_reason}} · 处理结果：{{row.result_available?'可预览':row.result_reason}}</p>
          <template v-if="row.seconds"><p class="my-2 text-sm">阶段耗时存在嵌套和并行，不能直接相加。</p><ElTable :data="timingStages(row.seconds)" size="small"><ElTableColumn prop="label" label="阶段" /><ElTableColumn prop="formatted" label="耗时" /></ElTable></template>
          <p v-else>暂无上报的耗时统计。</p>
        </div>
      </template></ElTableColumn>
      <ElTableColumn prop="id" label="工作任务 ID" min-width="170" show-overflow-tooltip />
      <ElTableColumn label="处理类型" min-width="120"><template #default="{row}">{{kinds[row.kind]||row.kind}}</template></ElTableColumn>
      <ElTableColumn label="状态" width="120"><template #default="{row}"><ElTag :type="statusType(row.status)">{{statuses[row.status]||row.status}}</ElTag></template></ElTableColumn>
      <ElTableColumn label="进度" width="80"><template #default="{row}">{{row.progress}}%</template></ElTableColumn>
      <ElTableColumn label="创建时间" width="180"><template #default="{row}">{{timeText(row.created)}}</template></ElTableColumn>
      <ElTableColumn label="结束时间" width="180"><template #default="{row}">{{timeText(row.finished)}}</template></ElTableColumn>
      <ElTableColumn label="处理耗时" width="120"><template #default="{row}">{{formatSeconds(row.seconds?.processing_wall)}}</template></ElTableColumn>
      <ElTableColumn label="操作" width="160" fixed="right"><template #default="{row}">
        <ElButton link type="primary" :disabled="!row.preview_allowed||!(row.input_available||row.result_available)" @click="openPreview(row as RecordEntry)">对照预览</ElButton>
        <div class="text-xs text-gray-500">{{row.preview_allowed?(row.input_available||row.result_available?'':row.input_reason):['video.subtitle','video.watermark','image.watermark'].includes(row.kind)?'无素材查看权限':'此类型暂无素材预览'}}</div>
      </template></ElTableColumn>
    </ElTable>
    <ElPagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next" class="mt-4" @current-change="load" />
  </ElDialog>
  <ElDialog v-model="previewDialog" :title="`${previewRow?kinds[previewRow.kind]||previewRow.kind:'视频'} · 原素材与处理效果`" width="min(1000px, 96vw)" append-to-body destroy-on-close @closed="clearPreview">
    <div v-loading="previewBusy">
      <ElAlert v-if="previewError" :title="previewError" type="warning" :closable="false" class="mb-3" />
      <div v-if="preview" class="preview-grid">
        <section><h3>原素材</h3><img v-if="preview.media_type==='image'&&preview.input_url&&!inputFailed" :src="preview.input_url" crossorigin="use-credentials" alt="图片素材" @error="inputFailed=true" /><video v-else-if="preview.input_url&&!inputFailed" :src="preview.input_url" crossorigin="use-credentials" controls playsinline preload="metadata" @error="inputFailed=true" /><p v-else>{{inputFailed?'播放失败，请重新加载预览':preview.input_reason}}</p></section>
        <section><h3>处理结果</h3><img v-if="preview.media_type==='image'&&preview.result_url&&!resultFailed" :src="preview.result_url" crossorigin="use-credentials" alt="图片素材" @error="resultFailed=true" /><video v-else-if="preview.result_url&&!resultFailed" :src="preview.result_url" crossorigin="use-credentials" controls playsinline preload="metadata" @error="resultFailed=true" /><p v-else>{{resultFailed?'播放失败，请重新加载预览':preview.result_reason}}</p></section>
      </div>
    </div>
    <template #footer><ElButton v-if="previewRow" :loading="previewBusy" @click="openPreview(previewRow)">重新加载预览</ElButton><ElButton @click="previewDialog=false">关闭</ElButton></template>
  </ElDialog>
</template>

<style scoped>
.history-filters{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}.history-filters .el-select{width:180px}
.preview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.preview-grid h3{margin:0 0 10px;font-weight:600}.preview-grid img{width:100%;max-height:65vh;object-fit:contain;border-radius:8px}.preview-grid video{width:100%;max-height:65vh;background:#111;border-radius:8px}.preview-grid section{min-width:0}.preview-grid p{padding:24px 12px;border:1px solid var(--el-border-color);border-radius:8px;color:var(--el-text-color-secondary)}
@media(max-width:640px){.preview-grid{grid-template-columns:1fr}}
</style>
