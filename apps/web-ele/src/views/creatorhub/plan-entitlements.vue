<script setup lang="ts">
import { featureLabel } from '#/utils/feature-label';
import { computed, ref, watch } from 'vue';
import { useAccessStore } from '@vben/stores';
import { ElAlert,ElButton,ElDialog,ElDrawer,ElForm,ElFormItem,ElInputNumber,ElMessage,ElOption,ElSelect,ElSwitch,ElTable,ElTableColumn } from 'element-plus';
import { requestClient } from '#/api/request';
type Entitlement={plan_code:string;feature:string;unlimited:number;daily_count:number;single_seconds:number;daily_seconds:number;weight:number};
const props=defineProps<{plan:{code:string;name:string}}>();
const opened=defineModel<boolean>({required:true});
const access=useAccessStore();const canEdit=computed(()=>access.accessCodes.includes('membership-entitlements:update'));
const rows=ref<Entitlement[]>([]),features=ref<{feature:string;name:string}[]>([]);
const busy=ref(false),error=ref(''),editing=ref(false),creating=ref(false),saving=ref(false);
const form=ref<Entitlement>({plan_code:'',feature:'',unlimited:0,daily_count:0,single_seconds:0,daily_seconds:0,weight:0});
const featureName=(code:string)=>featureLabel(code,features.value.find(f=>f.feature===code)?.name);
const available=computed(()=>features.value.filter(f=>!rows.value.some(r=>r.feature===f.feature)));
const timed=computed(()=>['remove_subtitle','remove_watermark','extract_text_upload'].includes(form.value.feature));
let version=0;
async function load(){
 const current=++version;const code=props.plan.code;busy.value=true;error.value='';
 try{
  const [items,options]=await Promise.all([requestClient.get<Entitlement[]>('/configs/membership-entitlements'),canEdit.value?requestClient.get<{feature:string;name:string}[]>('/configs/options/feature-billing'):Promise.resolve([])]);
  if(current!==version)return;rows.value=items.filter(r=>r.plan_code===code).sort((a,b)=>b.weight-a.weight||a.feature.localeCompare(b.feature));features.value=options;
 }catch(e){if(current===version)error.value=e instanceof Error?e.message:'权益加载失败';}
 finally{if(current===version)busy.value=false;}
}
function edit(row?:Entitlement){creating.value=!row;form.value=row?{...row}:{plan_code:props.plan.code,feature:'',unlimited:0,daily_count:0,single_seconds:0,daily_seconds:0,weight:0};editing.value=true;}
async function save(){
 if(saving.value)return;
 if(!form.value.feature){ElMessage.warning('请选择功能');return;}
 const {plan_code,feature,...values}=form.value;
 if(!timed.value){values.single_seconds=0;values.daily_seconds=0;}
 saving.value=true;
 try{await requestClient[creating.value?'post':'put']('/configs/membership-entitlements',{keys:{plan_code,feature},values});editing.value=false;ElMessage.success('权益已保存');await load();}finally{saving.value=false;}
}
const sorting=ref(false),dragged=ref(''),dropFeature=ref('');let dropAfter=false;
function dragStart(event:DragEvent,feature:string){if(sorting.value||busy.value||saving.value){event.preventDefault();return;}dragged.value=feature;event.dataTransfer?.setData('text/plain',feature);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';}
function dragOver(event:DragEvent){
 if(!dragged.value)return;
 const row=(event.target as HTMLElement).closest('tr');const feature=row?.querySelector<HTMLElement>('[data-feature]')?.dataset.feature;
 if(!row||!feature)return;event.preventDefault();dropFeature.value=feature;dropAfter=event.clientY>row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;
}
async function drop(event:DragEvent){
 event.preventDefault();const source=dragged.value,target=dropFeature.value;dragged.value='';dropFeature.value='';
 if(!source||!target||source===target||sorting.value)return;
 const ordered=rows.value.filter(r=>r.feature!==source);const moved=rows.value.find(r=>r.feature===source);if(!moved)return;
 const index=ordered.findIndex(r=>r.feature===target);if(index<0)return;ordered.splice(index+(dropAfter?1:0),0,moved);
 sorting.value=true;
 try{await requestClient.post('/configs/membership-entitlements/reorder',{plan_code:props.plan.code,features:ordered.map(r=>r.feature)});ElMessage.success('权益顺序已保存');await load();}catch{await load();}finally{sorting.value=false;}
}
watch(()=>form.value.feature,()=>{if(!timed.value){form.value.single_seconds=0;form.value.daily_seconds=0;}});
watch([opened,()=>props.plan.code],()=>{editing.value=false;rows.value=[];error.value='';if(opened.value)void load();else{version++;busy.value=false;}},{immediate:true});
</script>
<template>
 <ElDrawer v-model="opened" :title="`${plan.name} · 次数与时长权益`" size="min(1100px,96vw)" destroy-on-close>
  <ElAlert title="不限次数仍受时长限制；时长0表示不限，有限次数下每日0次表示无免费次数。未配置的功能按积分规则使用。" type="info" :closable="false" class="mb-4"/>
  <ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-4"/>
  <div class="mb-4 flex gap-2"><ElButton :loading="busy" @click="load">刷新</ElButton><ElButton v-if="canEdit" type="primary" :disabled="busy||!!error||!available.length" @click="edit()">新增权益</ElButton></div>
  <p v-if="canEdit" class="mb-3 text-sm text-gray-500">拖动左侧手柄调整顺序，仅影响当前套餐。</p>
  <div @dragover="dragOver" @drop="drop">
  <ElTable :row-class-name="({row}: {row:Entitlement})=>row.feature===dropFeature?'entitlement-drop':''" v-loading="busy||sorting" :data="rows" border empty-text="该套餐暂未配置权益">
   <ElTableColumn v-if="canEdit" label="排序" width="65"><template #default="{row}"><span :data-feature="row.feature" :draggable="!sorting&&!busy" class="cursor-grab px-3 py-2" title="拖动排序" @dragstart="dragStart($event,row.feature)" @dragend="dragged='';dropFeature=''">⠿</span></template></ElTableColumn>
   <ElTableColumn label="功能" min-width="270"><template #default="{row}">{{featureName(row.feature)}}</template></ElTableColumn>
   <ElTableColumn label="每日免费次数" min-width="140"><template #default="{row}">{{row.unlimited?'不限次数':row.daily_count+' 次'}}</template></ElTableColumn>
   <ElTableColumn label="单次最长时长" min-width="140"><template #default="{row}">{{!['remove_subtitle','remove_watermark','extract_text_upload'].includes(row.feature)?'不适用':row.single_seconds?row.single_seconds+' 秒':'不限'}}</template></ElTableColumn>
   <ElTableColumn label="每日总时长" min-width="140"><template #default="{row}">{{!['remove_subtitle','remove_watermark','extract_text_upload'].includes(row.feature)?'不适用':row.daily_seconds?row.daily_seconds+' 秒':'不限'}}</template></ElTableColumn>
   <ElTableColumn v-if="canEdit" label="操作" width="90"><template #default="{row}"><ElButton link type="primary" @click="edit(row as Entitlement)">编辑</ElButton></template></ElTableColumn>
  </ElTable>
  </div>
 </ElDrawer>
 <ElDialog v-model="editing" :title="creating?'新增套餐权益':'编辑套餐权益'" width="min(560px,95vw)" append-to-body :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving">
  <ElForm label-position="top">
   <ElFormItem label="会员套餐">{{plan.name}}</ElFormItem>
   <ElFormItem label="功能"><ElSelect v-if="creating" v-model="form.feature" filterable placeholder="选择尚未配置的功能"><ElOption v-for="f in available" :key="f.feature" :value="f.feature" :label="featureLabel(f.feature,f.name)"/></ElSelect><span v-else>{{featureName(form.feature)}}</span></ElFormItem>
   <ElFormItem label="不限次数"><ElSwitch v-model="form.unlimited" :active-value="1" :inactive-value="0"/></ElFormItem>
   <ElFormItem label="每日免费次数"><ElInputNumber v-model="form.daily_count" :disabled="!!form.unlimited" :min="0" :max="1000000000" :precision="0"/></ElFormItem>
   <template v-if="timed"><ElFormItem label="单次最长秒数（0不限）"><ElInputNumber v-model="form.single_seconds" :min="0" :max="1000000000" :precision="0"/></ElFormItem><ElFormItem label="每日总秒数（0不限）"><ElInputNumber v-model="form.daily_seconds" :min="0" :max="1000000000" :precision="0"/></ElFormItem></template>
  </ElForm>
  <template #footer><ElButton :disabled="saving" @click="editing=false">取消</ElButton><ElButton type="primary" :loading="saving" @click="save">保存</ElButton></template>
 </ElDialog>
</template>

<style scoped>
:deep(.entitlement-drop){--el-table-tr-bg-color:var(--el-color-primary-light-9);outline:1px solid var(--el-color-primary);}
</style>
