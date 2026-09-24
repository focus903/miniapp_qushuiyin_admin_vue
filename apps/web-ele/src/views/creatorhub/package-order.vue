<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElDialog, ElButton, ElAlert, ElMessage } from 'element-plus';
import { requestClient } from '#/api/request';
const props=withDefaults(defineProps<{resource?: 'point-packages' | 'membership-plans'}>(),{resource:'point-packages'});
const open=defineModel<boolean>({required:true});
const emit=defineEmits<{saved:[]}>();
type Package={code:string;name:string;enabled:number};
const rows=ref<Package[]>([]);const busy=ref(false);const error=ref('');
const dragged=ref('');const target=ref('');const after=ref(false);
async function load(){busy.value=true;error.value='';try{rows.value=await requestClient.get<Package[]>(`/configs/${props.resource}`);}catch{error.value='加载失败，请关闭后重试';}finally{busy.value=false;}}
function start(event:DragEvent,code:string){if(busy.value){event.preventDefault();return;}dragged.value=code;if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',code);}}
function over(event:DragEvent,code:string){if(busy.value||!dragged.value)return;event.preventDefault();target.value=code;const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();after.value=event.clientY>rect.top+rect.height/2;}
function clear(){dragged.value='';target.value='';}
function drop(event:DragEvent){event.preventDefault();if(busy.value||!target.value||dragged.value===target.value){clear();return;}const item=rows.value.find(row=>row.code===dragged.value);if(item){const next=rows.value.filter(row=>row!==item);const index=next.findIndex(row=>row.code===target.value);if(index>=0){next.splice(index+(after.value?1:0),0,item);rows.value=next;}}clear();}
async function save(){busy.value=true;try{await requestClient.post(`/configs/${props.resource}/reorder`,{codes:rows.value.map(row=>row.code)});ElMessage.success('排序已保存');emit('saved');open.value=false;}catch{error.value='保存失败；若套餐列表已变化，请关闭后重新排序';}finally{busy.value=false;}}
onMounted(load);
</script>
<template>
<ElDialog v-model="open" :title="props.resource==='membership-plans'?'会员套餐排序':'充值套餐排序'" width="min(600px,95vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy">
 <ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-3"/>
 <p class="mb-3 text-sm text-gray-500">包含全部启用、停用套餐。按住左侧 ☰ 拖动，越靠上权重越大，点击保存后生效。</p>
 <div v-loading="busy" style="max-height:55vh;overflow:auto">
  <div v-for="row in rows" :key="row.code" class="order-row" :class="{'drop-before':target===row.code&&!after,'drop-after':target===row.code&&after}" @dragover="over($event,row.code)" @drop="drop">
   <span :draggable="!busy" class="handle" title="拖动排序" @dragstart="start($event,row.code)" @dragend="clear">☰</span>
   <span>{{row.name}} <small class="text-gray-400">{{row.code}}</small></span><small class="ml-auto text-gray-400">{{row.enabled?'启用':'停用'}}</small>
  </div>
 </div>
 <template #footer><ElButton :disabled="busy" @click="open=false">取消</ElButton><ElButton type="primary" :loading="busy" :disabled="!rows.length" @click="save">保存排序</ElButton></template>
</ElDialog>
</template>
<style scoped>
.order-row{display:flex;align-items:center;gap:12px;padding:12px 8px;border-top:2px solid transparent;border-bottom:2px solid var(--el-border-color-lighter)}
.handle{cursor:grab;padding:4px 10px;color:var(--el-color-primary);user-select:none}.drop-before{border-top-color:var(--el-color-primary)}.drop-after{border-bottom-color:var(--el-color-primary)}
</style>
