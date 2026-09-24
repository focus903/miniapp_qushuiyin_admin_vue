<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
const props=withDefaults(defineProps<{value:unknown;label?:string}>(),{label:'复制'});
const text=computed(()=>typeof props.value==='string'?props.value:'');
const busy=ref(false);
async function copy(){
 if(!text.value||busy.value)return;
 busy.value=true;
 try{
  if(navigator.clipboard?.writeText){
   try{await navigator.clipboard.writeText(text.value);ElMessage.success('已复制');return;}catch{/* 非安全上下文或权限拒绝时尝试兼容复制。 */}
  }
  const active=document.activeElement as HTMLElement|null;
  const selection=window.getSelection();
  const ranges=selection?Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i).cloneRange()):[];
  const input=document.createElement('textarea');input.value=text.value;input.readOnly=true;
  input.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';document.body.append(input);
  try{input.select();if(!document.execCommand('copy'))throw new Error('copy failed');}
  finally{input.remove();active?.focus({preventScroll:true});if(selection&&ranges.length){selection.removeAllRanges();ranges.forEach(range=>selection.addRange(range));}}
  ElMessage.success('已复制');
 }catch{ElMessage.warning('复制失败，请选中地址手动复制');}
 finally{busy.value=false;}
}
</script>
<template>
 <span class="copy-value"><slot>{{text||'—'}}</slot><button v-if="text" type="button" class="copy-icon" :title="label" :aria-label="label" :disabled="busy" @click.stop="copy"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button></span>
</template>
<style scoped>
.copy-value{overflow-wrap:anywhere;white-space:normal}.copy-icon{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-left:6px;width:25px;height:25px;padding:3px;border:0;border-radius:4px;background:transparent;color:var(--el-color-primary);cursor:pointer}.copy-icon:hover{background:var(--el-color-primary-light-9)}.copy-icon:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:1px}.copy-icon:disabled{opacity:.5;cursor:wait}
</style>
