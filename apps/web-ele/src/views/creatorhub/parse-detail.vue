<script setup lang="ts">
import CopyValue from '#/components/copy-value.vue';
import { computed, ref, watch } from 'vue';
import { ElAlert, ElButton, ElCard, ElCollapse, ElCollapseItem, ElEmpty, ElImage, ElInput, ElMessage, ElTag } from 'element-plus';
type MediaFile = {id:string;media_type:string;position:number;object_url:string;object_key:string;storage_type:string};
type Resource = {resource_key:string;source_url:string;output_mode:string;run_id:string;files:MediaFile[]};
const props=defineProps<{detail:Record<string,unknown>;canResources?:boolean;canFiles?:boolean}>();
const resources=computed(()=>props.canResources?((props.detail.related_resources as Resource[])||[]).map(resource=>({...resource,files:props.canFiles?(resource.files||[]):[]})):[]);
const failed=ref<Record<string,boolean>>({});
watch(()=>props.detail,()=>{failed.value={};});
function url(value:string){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?value:'';}catch{return '';}}
function previewFrame(event:Event){
 const video=event.target as HTMLVideoElement;
 if(Number.isFinite(video.duration)&&video.duration>0)video.currentTime=Math.min(0.1,video.duration/2);
}
function pictures(resource:Resource){return resource.files.filter(f=>f.media_type==='image').map(f=>url(f.object_url)).filter(Boolean);}
async function copy(value:unknown){
 try{await navigator.clipboard.writeText(String(value));ElMessage.success('已复制');}
 catch{ElMessage.warning('自动复制不可用，请选中文本手动复制');}
}
</script>
<template>
<div class="mt-4 space-y-4">
 <ElCard shadow="never">
  <template #header><strong>解析结果预览</strong></template>
  <div class="mb-4 whitespace-pre-wrap break-words text-lg">{{detail.title||'暂无标题'}}</div>
  <ElAlert :title="String(detail.association_note||'当前关联资源')" type="info" :closable="false" />
  <ElEmpty v-if="!resources.length" description="没有匹配的媒体资源，暂时无法预览" />
  <section v-for="resource in resources" :key="resource.resource_key" class="mt-4">
   <div class="mb-3 flex flex-wrap items-center gap-2"><ElTag>{{resource.output_mode==='cache'?'缓存模式':'直连模式'}}</ElTag><span class="text-sm">{{resource.files.filter(f=>f.media_type==='video').length}} 个视频 · {{resource.files.filter(f=>f.media_type==='image').length}} 张图片</span></div>
   <ElEmpty v-if="!resource.files.length" description="当前批次暂无有效文件" />
   <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <div v-for="file in resource.files" :key="file.id" class="overflow-hidden rounded border border-solid border-gray-200 p-2">
     <div class="mb-2 text-sm">{{file.media_type==='video'?'视频':'图片'}} {{file.position+1}}</div>
     <video v-if="file.media_type==='video'&&url(file.object_url)&&!failed[file.id]" :src="url(file.object_url)" controls playsinline preload="metadata" @loadedmetadata="previewFrame" class="w-full rounded bg-black" style="height:280px" @error="failed[file.id]=true" />
     <ElImage v-else-if="file.media_type==='image'&&url(file.object_url)" :src="url(file.object_url)" :preview-src-list="pictures(resource)" :initial-index="pictures(resource).indexOf(url(file.object_url))" preview-teleported fit="contain" lazy class="w-full rounded" style="height:280px">
      <template #error><div class="p-4 text-sm">图片暂时无法加载，地址可能失效或有访问限制。</div></template>
     </ElImage>
     <ElAlert v-else title="视频暂时无法播放，地址可能失效或有访问限制。可复制地址检查。" type="warning" :closable="false" />
     <ElButton class="mt-2" :disabled="!file.object_url" link type="primary" @click="copy(file.object_url)">复制文件地址</ElButton>
    </div>
   </div>
  </section>
 </ElCard>
 <ElCollapse>
  <ElCollapseItem :title="detail.share_text ? '查看原始分享文案、完整链接和文件地址' : '查看完整链接和文件地址'" name="source">
   <div v-if="detail.share_text" class="mb-2 flex items-center justify-between"><strong>原始分享文案</strong><ElButton :disabled="!detail.share_text" link type="primary" @click="copy(detail.share_text)">复制文案</ElButton></div>
   <ElInput v-if="detail.share_text" :model-value="String(detail.share_text||'')" type="textarea" :autosize="{minRows:3,maxRows:8}" readonly placeholder="无原始分享文案" />
   <div class="mb-2 mt-4 flex items-center justify-between"><strong>完整分享链接</strong><ElButton :disabled="!detail.source_url" link type="primary" @click="copy(detail.source_url)">复制链接</ElButton></div>
   <div class="break-all whitespace-pre-wrap select-text"><CopyValue :value="detail.source_url" label="复制完整分享链接">{{detail.source_url||'未提取到有效分享链接'}}</CopyValue></div>
   <section v-for="resource in resources" :key="resource.resource_key" class="mt-4">
    <div class="break-all text-sm">{{resource.output_mode}} · 批次：{{resource.run_id}}</div>
    <div class="mb-3 break-all">来源：<CopyValue :value="resource.source_url" label="复制来源链接" /></div>
    <div v-for="file in resource.files" :key="file.id" class="mb-3">
     <strong>{{file.media_type==='video'?'视频':'图片'}} {{file.position+1}}</strong>
     <div class="break-all whitespace-pre-wrap select-text"><CopyValue :value="file.object_url" label="复制文件地址">{{file.object_url||'无文件地址'}}</CopyValue></div>
     <div class="break-all text-sm text-gray-500">文件路径：<CopyValue :value="file.object_key" label="复制文件路径" /></div>
    </div>
   </section>
  </ElCollapseItem>
 </ElCollapse>
</div>
</template>
