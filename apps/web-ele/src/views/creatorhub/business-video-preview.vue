<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ElAlert, ElButton } from 'element-plus';
import { requestClient } from '#/api/request';
const props=defineProps<{resource:string;recordId:string|number}>();
type Preview={input_url:string;result_url:string;input_reason:string;result_reason:string;media_expires:number};
const value=ref<Preview|null>(null),busy=ref(false),error=ref(''),inputFailed=ref(false),resultFailed=ref(false);
const hasResult=computed(()=>['subtitle','watermark'].includes(props.resource));
let version=0,active=true;
function mediaUrl(url:string){try{const parsed=new URL(url);return ['https:','http:'].includes(parsed.protocol)?url:'';}catch{return '';}}
async function load(){
 const current=++version;value.value=null;error.value='';busy.value=true;inputFailed.value=false;resultFailed.value=false;
 try{
  const data=await requestClient.post<Preview>(`/operations/records/${props.resource}/${encodeURIComponent(String(props.recordId))}/preview`,{});
  if(current===version&&active)value.value={...data,input_url:mediaUrl(data.input_url),result_url:mediaUrl(data.result_url)};
 }catch(cause){if(current===version&&active)error.value=cause instanceof Error?cause.message:'视频预览加载失败';}
 finally{if(current===version&&active)busy.value=false;}
}
watch(()=>[props.resource,props.recordId],()=>void load(),{immediate:true});
onBeforeUnmount(()=>{active=false;version++;value.value=null;});
</script>
<template>
 <section v-loading="busy" class="my-4">
  <div class="mb-3 flex items-center justify-between"><strong>视频预览</strong><ElButton size="small" :loading="busy" @click="load">重新加载预览</ElButton></div>
  <ElAlert v-if="error" :title="error" type="error" :closable="false" />
  <div v-if="value" class="video-grid" :class="{'single-video':!hasResult}">
   <section><h4>原视频</h4><video v-if="value.input_url&&!inputFailed" :src="value.input_url" controls playsinline crossorigin="use-credentials" preload="metadata" @error="inputFailed=true"/><p v-else>{{inputFailed?'播放失败，请重新加载预览；浏览器可能不支持此视频格式':value.input_reason}}</p></section>
   <section v-if="hasResult"><h4>处理结果</h4><video v-if="value.result_url&&!resultFailed" :src="value.result_url" controls playsinline crossorigin="use-credentials" preload="metadata" @error="resultFailed=true"/><p v-else>{{resultFailed?'播放失败，请重新加载预览':value.result_reason}}</p></section>
  </div>
  <p v-if="value?.media_expires" class="mt-2 text-xs text-gray-500">素材保留至：{{new Date(value.media_expires*1000).toLocaleString('zh-CN')}}；过期或删除后不可播放。</p>
 </section>
</template>
<style scoped>
.video-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.single-video{grid-template-columns:1fr}.video-grid h4{margin-bottom:8px;font-weight:600}.video-grid video{width:100%;max-height:50vh;background:#111;border-radius:6px}.video-grid p{padding:24px;color:var(--el-text-color-secondary);background:var(--el-fill-color-light)}
@media(max-width:640px){.video-grid{grid-template-columns:1fr}}
</style>
