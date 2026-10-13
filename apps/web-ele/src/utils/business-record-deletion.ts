import { computed, ref, watch } from 'vue';
import { useAccessStore } from '@vben/stores';
import { ElMessage, ElMessageBox } from 'element-plus';
import { requestClient } from '#/api/request';

export function useBusinessRecordDeletion(resource:()=>string,reload:()=>Promise<void>){
 const access=useAccessStore(),selected=ref<Record<string,unknown>[]>([]),busy=ref(false),error=ref('');
 const allowed=computed(()=>['subtitle','watermark','transcripts','text-tasks','image-records'].includes(resource())&&access.accessCodes.includes(`${['transcripts','text-tasks'].includes(resource())?'transcripts':resource()}:delete`));
 let generation=0;
 function reset(){generation++;selected.value=[];error.value='';}
 watch(resource,reset);
 async function remove(ids:string[]){
  if(!allowed.value||busy.value)return;
  ids=[...new Set(ids)].filter(Boolean);
  if(!ids.length)return;
  if(ids.length>100){error.value='每次最多删除100条，请减少选择数量。';return;}
  const name=resource(),current=generation;
  const description=name==='image-records'?'原图、处理结果和识别文字':'原视频、处理结果';
  try{await ElMessageBox.confirm(`永久删除这 ${ids.length} 条记录及对应${description}？此操作不可恢复；仍被其他记录引用的素材会保留。`,'确认删除',{type:'warning',confirmButtonText:'删除',cancelButtonText:'取消'});}catch{return;}
  if(current!==generation||!allowed.value||busy.value)return;
  busy.value=true;error.value='';
  try{
   const endpoint=name==='image-records'?'/image-records/delete':`/operations/records/${name}/delete`;
   const result=await requestClient.post<{deleted:number;deleted_ids:string[];retained_files:number;failed:{id:string;message:string}[]}>(endpoint,{ids,confirm:true});
   if(current!==generation)return;
   selected.value=selected.value.filter(row=>!result.deleted_ids.includes(String(row.id)));
   if(result.failed.length)error.value=result.failed.map(item=>`${item.id}：${item.message}`).join('\n');
   if(result.deleted)ElMessage.success(`已删除${result.deleted}条记录${result.retained_files?'；其他记录仍引用的素材已保留':''}`);
   await reload();
  }catch(cause){if(current===generation)error.value=cause instanceof Error?cause.message:'删除未完成，请刷新核对后重试。';}
  finally{busy.value=false;}
 }
 return {allowed,selected,busy,error,remove,reset};
}
