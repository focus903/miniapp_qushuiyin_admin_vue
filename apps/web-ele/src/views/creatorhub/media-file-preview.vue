<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElAlert, ElDialog, ElImage } from 'element-plus';
const props=defineProps<{file:Record<string,unknown>;compact?:boolean}>();
const emit=defineEmits<{error:[];loaded:[]}>();
function loadError(){emit('error');}
function playbackError(){failed.value=true;loadError();}
const playing=ref(false);const failed=ref(false);
const tile=ref<HTMLElement>();const visible=ref(false);const previewReady=ref(false);const previewFailed=ref(false);
let observer:IntersectionObserver|undefined;
onMounted(()=>{
 if(!tile.value)return;
 if(typeof IntersectionObserver==='undefined'){visible.value=true;return;}
 observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){visible.value=true;observer?.disconnect();}},{rootMargin:'100px'});
 observer.observe(tile.value);
});
onBeforeUnmount(()=>observer?.disconnect());
function seekPreview(event:Event){
 const video=event.target as HTMLVideoElement;
 if(Number.isFinite(video.duration)&&video.duration>0)video.currentTime=Math.min(0.1,video.duration/2);
}
const src=computed(()=>{try{const value=String(props.file.object_url||'');const url=new URL(value);return ['http:','https:'].includes(url.protocol)?value:'';}catch{return '';}});
watch(()=>props.file,()=>{playing.value=false;failed.value=false;previewReady.value=false;previewFailed.value=false;});
function play(){failed.value=false;playing.value=true;}
</script>
<template>
<div ref="tile">
 <ElImage v-if="file.media_type==='image'&&src" :src="src" :preview-src-list="[src]" preview-teleported hide-on-click-modal @error="loadError" @load="emit('loaded')" fit="contain" lazy :style="{width:compact?'96px':'320px',height:compact?'72px':'240px',maxWidth:'100%'}" class="cursor-zoom-in rounded">
  <template #error><span class="text-xs">图片加载失败</span></template>
 </ElImage>
 <button v-else-if="file.media_type==='video'&&src" type="button" class="video-tile" :style="{width:compact?'96px':'320px',height:compact?'72px':'240px'}" aria-label="播放视频" @click.stop="play">
  <video v-if="visible&&!previewFailed" :key="src" :src="src" muted playsinline preload="metadata" class="video-frame" tabindex="-1" aria-hidden="true" @loadedmetadata="seekPreview" @loadeddata="previewReady=true;emit('loaded')" @seeked="previewReady=true" @error="previewFailed=true;loadError()" />
  <span class="video-shade"></span>
  <span class="video-play"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>
  <span v-if="previewFailed||!previewReady" class="video-caption">{{previewFailed?'预览不可用':visible?'加载预览…':'视频预览'}}</span>
 </button>
 <button v-else-if="file.media_type==='audio'&&src" type="button" class="audio-tile" aria-label="播放音频" title="播放音频" @click.stop="play">
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
 </button>
 <span v-else class="text-xs text-gray-500">暂无可预览地址</span>
 <ElDialog v-model="playing" :title="file.media_type==='audio'?'音频播放':'视频预览'" width="min(900px, 92vw)" append-to-body destroy-on-close @close="playing=false">
  <template v-if="playing"><ElAlert v-if="failed" title="媒体无法播放，地址可能失效或有访问限制。" type="warning" :closable="false" /><audio v-else-if="file.media_type==='audio'" :src="src" controls autoplay class="w-full" @error="playbackError" @loadeddata="emit('loaded')" /><video v-else :src="src" controls autoplay playsinline preload="metadata" class="w-full rounded bg-black" style="max-height:70vh" @error="playbackError" @loadeddata="emit('loaded')" /></template>
 </ElDialog>
</div>
</template>

<style scoped>
.audio-tile{display:flex;align-items:center;justify-content:center;width:48px;height:48px;border:0;border-radius:50%;background:var(--el-color-primary-light-9);color:var(--el-color-primary);cursor:pointer}.audio-tile:hover{background:var(--el-color-primary-light-8)}
.video-tile{position:relative;display:block;max-width:100%;overflow:hidden;border:0;border-radius:8px;padding:0;background:#161b24;color:white;cursor:pointer}.video-frame{width:100%;height:100%;object-fit:cover;pointer-events:none}.video-shade{position:absolute;inset:0;background:linear-gradient(transparent,rgba(0,0,0,.3))}.video-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.7)}.video-caption{position:absolute;left:0;right:0;bottom:4px;font-size:11px;text-align:center}.video-tile:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:3px}
</style>
