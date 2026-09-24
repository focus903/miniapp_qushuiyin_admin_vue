<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { moveGroup } from './voice-order';
import { useAccessStore } from '@vben/stores';
import { ElAlert, ElButton, ElDialog, ElDrawer, ElForm, ElFormItem, ElInput, ElInputNumber, ElMessage, ElMessageBox, ElOption, ElSelect, ElSwitch, ElTable, ElTableColumn } from 'element-plus';
import { requestClient } from '#/api/request';
type Voice = { voice_id:number; name:string; voice_code:string; sex:string; provider_name:string; preview_text?:string; speech_type?:string; voice_enabled:number; provider_enabled:number; tag?:string; sort_order?:number; enabled?:number };
const opened=defineModel<boolean>({default:false});
const props=defineProps<{category?:{id:number;name:string}}>();
const access=useAccessStore();
const canEdit=computed(()=>access.accessCodes.includes('tts-relations:update'));
const canPreview=computed(()=>access.accessCodes.includes('tts-voices:preview'));
const rows=ref<Voice[]>([]), options=ref<Voice[]>([]);
const selected=ref<Voice[]>([]), adding=ref<number[]>([]);
const addKeyword=ref(''), addProvider=ref(''), addSex=ref(''), addStyle=ref('');
const addProviders=computed(()=>[...new Set(options.value.map(v=>v.provider_name))]);
const addStyles=computed(()=>[...new Set(options.value.filter(v=>!addProvider.value||v.provider_name===addProvider.value).map(v=>v.speech_type||'未指定'))]);
const addFiltered=computed(()=>options.value.filter(v=>(!addProvider.value||v.provider_name===addProvider.value)&&(!addSex.value||gender(v.sex)===addSex.value)&&(!addStyle.value||(v.speech_type||'未指定')===addStyle.value)&&(!addKeyword.value.trim()||`${v.name} ${v.voice_code}`.toLowerCase().includes(addKeyword.value.trim().toLowerCase()))));
function addSelectionChanged(value:Voice[]){adding.value=value.map(v=>v.voice_id);}
watch(addProvider,()=>{addStyle.value='';});
function selectionChanged(value:Voice[]){selected.value=value;}
const keyword=ref(''), sex=ref(''), provider=ref(''), error=ref(''), busy=ref(false), saving=ref(false);
const dialog=ref(false), editing=ref(false), audioUrl=ref(''), previewId=ref<number>();
const form=ref({voice_id:undefined as number|undefined,tag:'',sort_order:0,enabled:1});
const providers=computed(()=>[...new Set(rows.value.map(r=>r.provider_name))]);
const gender=(value:string)=>({male:'男',female:'女',child:'童声'}[value]||value||'未指定');
const filtered=computed(()=>rows.value.filter(r=>(!keyword.value.trim()||`${r.name} ${r.voice_code}`.toLowerCase().includes(keyword.value.trim().toLowerCase()))&&(!sex.value||gender(r.sex)===sex.value)&&(!provider.value||r.provider_name===provider.value)));
const table=ref<{toggleRowSelection:(row:Voice,selected:boolean)=>void}>();
const surface=ref<HTMLElement>();
const selectionBox=ref<{left:number;top:number;width:number;height:number}>();
const dropTarget=ref<number>();
const dropAfter=ref(false);
const moving=ref(false);
let gesture: {x:number;y:number;mode:'box'|'move';ids:number[];active:boolean}|undefined;
const selectedIds=computed(()=>new Set(selected.value.map(row=>row.voice_id)));
function rowClass({row}:{row:Voice}) {
 return [`voice-row-${row.voice_id}`,selectedIds.value.has(row.voice_id)?'voice-selected':'',dropTarget.value===row.voice_id?(dropAfter.value?'drop-after':'drop-before'):''].join(' ');
}
function visibleRows(){
 return Array.from(surface.value?.querySelectorAll<HTMLElement>('.el-table__body tr.el-table__row')||[]).map(el=>({el,id:Number(/voice-row-(\d+)/.exec(el.className)?.[1])}));
}
function stopGesture(){
 gesture=undefined;selectionBox.value=undefined;dropTarget.value=undefined;moving.value=false;
 window.removeEventListener('pointermove',pointerMove);window.removeEventListener('pointerup',pointerUp);window.removeEventListener('pointercancel',stopGesture);window.removeEventListener('blur',stopGesture);window.removeEventListener('keydown',cancelKey);
}
function cancelKey(event:KeyboardEvent){if(event.key==='Escape')stopGesture();}
function pointerDown(event:PointerEvent){
 if(event.button!==0||event.pointerType!=='mouse'||!canEdit.value||busy.value||saving.value)return;
 const target=event.target as HTMLElement;
 if(target.closest('button,a,input,label,.el-checkbox,.el-table__header-wrapper,.el-scrollbar__bar'))return;
 const row=target.closest<HTMLElement>('.el-table__row');
 const id=Number(/voice-row-(\d+)/.exec(row?.className||'')?.[1]);
 const handle=!!target.closest('.voice-handle');
 const move=!!row&&(selectedIds.value.has(id)||handle);
 if(move&&!canDrag.value)return;
 stopGesture();
 gesture={x:event.clientX,y:event.clientY,mode:move?'move':'box',ids:move?(selectedIds.value.has(id)?selected.value.map(r=>r.voice_id):[id]):[],active:false};
 event.preventDefault();
 window.addEventListener('pointermove',pointerMove);window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',stopGesture);window.addEventListener('blur',stopGesture);window.addEventListener('keydown',cancelKey);
}
function pointerMove(event:PointerEvent){
 const g=gesture;if(!g)return;
 if(Math.hypot(event.clientX-g.x,event.clientY-g.y)<5&&!g.active)return;
 g.active=true;
 if(g.mode==='box'){
  const box={left:Math.min(g.x,event.clientX),top:Math.min(g.y,event.clientY),width:Math.abs(g.x-event.clientX),height:Math.abs(g.y-event.clientY)};
  selectionBox.value=box;
  const ids=new Set(visibleRows().filter(({el})=>{const r=el.getBoundingClientRect();return r.right>=box.left&&r.left<=box.left+box.width&&r.bottom>=box.top&&r.top<=box.top+box.height;}).map(r=>r.id));
  for(const row of filtered.value)table.value?.toggleRowSelection(row,ids.has(row.voice_id));
 }else{
  moving.value=true;dropTarget.value=undefined;
  const hit=visibleRows().find(({el})=>{const r=el.getBoundingClientRect();return event.clientY>=r.top&&event.clientY<=r.bottom&&event.clientX>=r.left&&event.clientX<=r.right;});
  if(hit&&!g.ids.includes(hit.id)){dropTarget.value=hit.id;dropAfter.value=event.clientY>hit.el.getBoundingClientRect().top+hit.el.getBoundingClientRect().height/2;}
 }
}
function pointerUp(){
 const g=gesture;const target=dropTarget.value;const after=dropAfter.value;
 stopGesture();
 if(g?.active&&g.mode==='move'&&target!==undefined)void reorder(g.ids,target,after);
}
onBeforeUnmount(stopGesture);
watch([opened,()=>props.category?.id,keyword,sex,provider,busy,saving],stopGesture);
const canDrag=computed(()=>canEdit.value&&!busy.value&&!saving.value&&!keyword.value.trim()&&!sex.value&&!provider.value);
let version=0;
async function load(){
 const id=props.category?.id;if(!opened.value||!id)return;
 const current=++version;busy.value=true;error.value='';
 try {const result=await requestClient.get<Voice[]>(`/catalog/categories/${id}/voices`);if(current===version){rows.value=result;selected.value=[];}}
 catch(e){if(current===version)error.value=e instanceof Error?e.message:'加载失败';}
 finally{if(current===version)busy.value=false;}
}
watch([opened,()=>props.category?.id],()=>{version++;rows.value=[];selected.value=[];adding.value=[];audioUrl.value='';previewId.value=undefined;dialog.value=false;keyword.value='';sex.value='';provider.value='';void load();});
async function edit(row?:Voice){
 const id=props.category?.id;if(!id||saving.value)return;
 editing.value=!!row;adding.value=[];addKeyword.value='';addProvider.value='';addSex.value='';addStyle.value='';form.value={voice_id:row?.voice_id,tag:row?.tag||'',sort_order:row?.sort_order||0,enabled:row?.enabled??1};options.value=[];
 if(!row){
  const current=version;
  try{const result=await requestClient.get<Voice[]>(`/catalog/categories/${id}/voice-options`);if(current!==version)return;options.value=result;}
  catch{return;}
 }
 dialog.value=true;
}
async function save(){
 const id=props.category?.id;if(!id||(editing.value?!form.value.voice_id:adding.value.length===0))return;
 saving.value=true;
 try{
  const body={category_id:id,...form.value};
  if(editing.value)await requestClient.put(`/catalog/relations/${id}:${form.value.voice_id}`,body);
  else await requestClient.post(`/catalog/categories/${id}/voices/batch`,{action:'add',voice_ids:adding.value});
  dialog.value=false;ElMessage.success('已保存分类关联');await load();
 }finally{saving.value=false;}
}
async function remove(row:Voice){
 const id=props.category?.id;if(!id||saving.value)return;
 try{await ElMessageBox.confirm(`将“${row.name}”从当前分类移除，音色本身及其他分类不受影响。`,'移除音色',{type:'warning'});}catch{return;}
 if(id!==props.category?.id||!opened.value)return;
 saving.value=true;
 try{await requestClient.delete(`/catalog/categories/${id}/voices/${row.voice_id}`);audioUrl.value='';await load();ElMessage.success('已移除关联');}finally{saving.value=false;}
}
async function removeSelected(){
 const id=props.category?.id;const ids=selected.value.map(v=>v.voice_id);if(!id||!ids.length||saving.value)return;
 try{await ElMessageBox.confirm(`从当前分类移除已选的 ${ids.length} 个音色？音色本身及其他分类不受影响。`,'批量移除',{type:'warning'});}catch{return;}
 if(id!==props.category?.id||!opened.value)return;
 saving.value=true;
 try{await requestClient.post(`/catalog/categories/${id}/voices/batch`,{action:'remove',voice_ids:ids});audioUrl.value='';await load();ElMessage.success('已移除选中关联');}finally{saving.value=false;}
}
async function reorder(group:number[],target:number,after:boolean){
 const id=props.category?.id;if(!id||!canDrag.value)return;
 const before=rows.value.map(v=>v.voice_id);const ids=moveGroup(before,group,target,after);
 if(ids.every((value,index)=>value===before[index]))return;
 saving.value=true;
 try{await requestClient.put(`/catalog/categories/${id}/voices/order`,{voice_ids:ids});if(id===props.category?.id){await load();ElMessage.success('排序已保存');}}
 catch{if(id===props.category?.id)await load();}
 finally{saving.value=false;}
}
async function preview(row:Voice){
 const current=version;audioUrl.value='';previewId.value=row.voice_id;
 try{const result=await requestClient.post<{audioUrl:string}>(`/catalog/voices/${row.voice_id}/preview`);if(current===version&&previewId.value===row.voice_id)audioUrl.value=result.audioUrl;}
 finally{if(current===version&&previewId.value===row.voice_id)previewId.value=undefined;}
}
</script>
<template>
 <ElDrawer v-model="opened" :title="`${category?.name||''} · 分类音色`" size="min(1500px,96vw)" destroy-on-close>
  <ElAlert v-if="error" :title="error" type="error" class="mb-3"/>
  <ElAlert title="移除仅解除当前分类关联。试听优先复用缓存；没有缓存时会调用配音服务生成。" type="info" :closable="false" class="mb-3"/>
  <div class="mb-3 flex flex-wrap gap-2">
   <ElInput v-model="keyword" placeholder="音色名称或标识" clearable style="width:200px"/>
   <ElSelect v-model="provider" placeholder="全部厂家" clearable style="width:160px"><ElOption v-for="p in providers" :key="p" :label="p" :value="p"/></ElSelect>
   <ElSelect v-model="sex" placeholder="全部性别" clearable style="width:130px"><ElOption v-for="s in ['男','女','童声','未指定']" :key="s" :label="s" :value="s"/></ElSelect>
   <ElButton @click="load">刷新</ElButton><ElButton v-if="canEdit" type="primary" :disabled="saving" @click="edit()">添加音色</ElButton>
  <ElButton v-if="canEdit" type="danger" :disabled="!selected.length||saving" @click="removeSelected">移除选中（{{ selected.length }}）</ElButton>
  </div>
  <audio v-if="audioUrl && !dialog" :key="audioUrl" :src="audioUrl" controls autoplay class="mb-3" @error="ElMessage.error('试听音频无法播放，请重试')"/>
  <div class="mb-2">共 {{ filtered.length }} 个音色 · 左键从空白处框选，按住已选行拖动整组；松开自动保存，Esc 取消。筛选时不可排序。</div>
  <div ref="surface" class="voice-surface" :class="{moving}" @pointerdown="pointerDown" @dragstart.prevent>
  <ElTable ref="table" v-loading="busy" :data="filtered" :row-class-name="rowClass" row-key="voice_id" @selection-change="selectionChanged">
   <ElTableColumn v-if="canEdit" type="selection" width="45"/>
   <ElTableColumn v-if="canEdit" label="拖动" width="70"><template #default><span class="voice-handle" :style="{cursor:canDrag?'grab':'not-allowed'}" title="拖动本行或选中组">☰</span></template></ElTableColumn>
   <ElTableColumn label="音色" min-width="170"><template #default="{row}"><ElButton link :disabled="!canPreview||!row.voice_enabled||!row.provider_enabled" @click="preview(row as Voice)">{{ row.name }}</ElButton></template></ElTableColumn>
   <ElTableColumn prop="provider_name" label="厂家" min-width="110"/>
   <ElTableColumn label="性别" width="75"><template #default="{row}">{{ gender(row.sex) }}</template></ElTableColumn>
   <ElTableColumn label="示例文本" min-width="300"><template #default="{row}"><div class="voice-preview-text">{{ row.preview_text || '未配置示例文本' }}</div></template></ElTableColumn>
   <ElTableColumn prop="tag" label="标签" width="90"/>
   <ElTableColumn prop="sort_order" label="排序（小值优先）" width="140"/>
   <ElTableColumn label="关联状态" width="90"><template #default="{row}">{{ row.enabled?'启用':'停用' }}</template></ElTableColumn>
   <ElTableColumn label="操作" width="180"><template #default="{row}">
    <ElButton v-if="canPreview" link :loading="previewId===row.voice_id" :disabled="!row.voice_enabled||!row.provider_enabled" @click="preview(row as Voice)">试听</ElButton>
    <ElButton v-if="canEdit" link :disabled="saving" @click="edit(row as Voice)">编辑</ElButton><ElButton v-if="canEdit" link type="danger" :disabled="saving" @click="remove(row as Voice)">移除</ElButton>
   </template></ElTableColumn>
  </ElTable>
  </div>
  <Teleport to="body"><div v-if="selectionBox" class="voice-selection-box" :style="{left:selectionBox.left+'px',top:selectionBox.top+'px',width:selectionBox.width+'px',height:selectionBox.height+'px'}"/></Teleport>
  <ElDialog v-model="dialog" :title="editing?'编辑分类关联':'添加已有音色'" :width="editing?'min(520px,95vw)':'min(1350px,96vw)'" destroy-on-close append-to-body :close-on-click-modal="!saving">
   <template v-if="!editing">
    <div class="mb-3 flex flex-wrap gap-2">
     <ElSelect v-model="addProvider" placeholder="全部厂商" clearable style="width:170px"><ElOption v-for="p in addProviders" :key="p" :label="p" :value="p"/></ElSelect>
     <ElSelect v-model="addSex" placeholder="全部性别" clearable style="width:130px"><ElOption v-for="g in ['男','女','童声','未指定']" :key="g" :label="g" :value="g"/></ElSelect>
     <ElSelect v-model="addStyle" placeholder="全部声音风格" filterable clearable style="width:190px"><ElOption v-for="s in addStyles" :key="s" :label="s" :value="s"/></ElSelect>
     <ElInput v-model="addKeyword" placeholder="搜索音色名称或标识" clearable style="width:220px"/>
    </div>
    <div class="mb-3">匹配 {{ addFiltered.length }} 个音色 · 已选 {{ adding.length }} 个（切换筛选保留选择）。已加入分类的音色不在此列出。</div>
    <audio v-if="audioUrl" :key="audioUrl" :src="audioUrl" controls autoplay class="mb-3" @error="ElMessage.error('试听音频无法播放，请重试')"/>
    <ElTable :data="addFiltered" row-key="voice_id" max-height="480" @selection-change="addSelectionChanged">
     <ElTableColumn type="selection" :reserve-selection="true" width="45"/>
     <ElTableColumn prop="name" label="音色名称" min-width="160"/>
     <ElTableColumn prop="provider_name" label="厂商" width="110"/>
     <ElTableColumn label="性别" width="75"><template #default="{row}">{{ gender(row.sex) }}</template></ElTableColumn>
     <ElTableColumn label="声音风格" min-width="140"><template #default="{row}">{{ row.speech_type || '未指定' }}</template></ElTableColumn>
     <ElTableColumn label="示例文本" min-width="300"><template #default="{row}"><div class="voice-preview-text">{{ row.preview_text || '未配置示例文本' }}</div></template></ElTableColumn>
     <ElTableColumn label="试听" width="90"><template #default="{row}"><ElButton v-if="canPreview" link :loading="previewId===row.voice_id" :disabled="!row.voice_enabled||!row.provider_enabled" @click="preview(row as Voice)">试听</ElButton></template></ElTableColumn>
    </ElTable>
   </template>
   <ElForm label-width="110px">

    <ElFormItem v-if="editing" label="标签"><ElInput v-model="form.tag" maxlength="64"/></ElFormItem>
    <ElFormItem v-if="editing" label="排序（小值优先）"><ElInputNumber v-model="form.sort_order" :min="0" :max="1000000000" :precision="0"/></ElFormItem>
    <ElFormItem v-if="editing" label="启用"><ElSwitch v-model="form.enabled" :active-value="1" :inactive-value="0"/></ElFormItem>
   </ElForm><template #footer><ElButton :disabled="saving" @click="dialog=false">取消</ElButton><ElButton type="primary" :loading="saving" :disabled="editing?!form.voice_id:(!adding.length||adding.length>1000)" @click="save">{{ editing?'保存':`添加选中（${adding.length}）` }}</ElButton></template>
  </ElDialog>
 </ElDrawer>
</template>

<style scoped>
.voice-preview-text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
.voice-surface { padding: 12px 12px 24px 24px; border: 1px dashed var(--el-border-color); user-select: none; }
.voice-handle { display: block; padding: 10px; }
.voice-surface :deep(.voice-selected td.el-table__cell) { background: var(--el-color-primary-light-9); }
.voice-surface :deep(.voice-selected) { cursor: grab; }
.voice-surface.moving, .voice-surface.moving :deep(.el-table__row) { cursor: grabbing; }
.voice-surface :deep(.drop-before td) { box-shadow: inset 0 2px var(--el-color-primary); }
.voice-surface :deep(.drop-after td) { box-shadow: inset 0 -2px var(--el-color-primary); }
.voice-selection-box { position: fixed; pointer-events: none; z-index: 9999; border: 1px solid var(--el-color-primary); background: color-mix(in srgb, var(--el-color-primary) 15%, transparent); }
</style>
