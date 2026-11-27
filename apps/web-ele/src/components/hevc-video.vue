<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElAlert, ElButton } from 'element-plus';

interface H265Player {
  build(config: Record<string, unknown>): boolean;
  load_media(url: string): void;
  set_voice?(value: number): void;
  release?(callback?: () => void): void;
  video_probe_callback?: (info: { codec?: string }) => void;
  on_ready_show_done_callback?: () => void;
  on_error_callback?: (error: unknown) => void;
}

declare global {
  interface Window {
    H265webjsPlayer?: () => H265Player;
  }
}

const props = withDefaults(
  defineProps<{
    src: string;
    codec?: string;
  }>(),
  { codec: '' },
);

const SDK_BASE = `${import.meta.env.BASE_URL || '/'}h265webjs/`;
const hostId = `hevc-player-${Math.random().toString(36).slice(2, 10)}`;
const hostRef = ref<HTMLDivElement | null>(null);
const nativeRef = ref<HTMLVideoElement | null>(null);
const useSdk = ref(false);
const sdkReady = ref(false);
const sdkError = ref('');
const probedCodec = ref('');
const mounted = ref(false);
let player: H265Player | null = null;
let runVersion = 0;
let sdkPromise: Promise<void> | null = null;
let nativeTimer: number | undefined;
let frameHandle: number | undefined;
let frameSeen = false;

const isHevc = () => /hevc|h\.265|hvc1|hev1/i.test(props.codec || '');

function nativeCanPlayHevc() {
  try {
    const video = document.createElement('video');
    return Boolean(
      video.canPlayType('video/mp4; codecs="hvc1"') ||
        video.canPlayType('video/mp4; codecs="hev1"'),
    );
  } catch {
    return false;
  }
}

function loadSdk() {
  if (window.H265webjsPlayer) return Promise.resolve();
  if (!sdkPromise) {
    sdkPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${SDK_BASE}h265web.js`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        sdkPromise = null;
        reject(new Error('HEVC 播放组件加载失败'));
      };
      document.head.appendChild(script);
    });
  }
  return sdkPromise;
}

function releasePlayer() {
  clearNativeWatchdog();
  runVersion++;
  const current = player;
  player = null;
  sdkReady.value = false;
  probedCodec.value = '';
  if (current?.release) {
    try {
      current.release();
    } catch {
      // 播放内核可能已释放；卸载流程不能因此中断。
    }
  }
}

async function setupSdk() {
  if (!props.src || !hostRef.value) return;
  const version = ++runVersion;
  sdkError.value = '';
  try {
    await loadSdk();
    if (version !== runVersion || !useSdk.value || !hostRef.value) return;
    const factory = window.H265webjsPlayer;
    if (!factory) throw new Error('HEVC 播放组件未就绪');
    player = factory();
    player.video_probe_callback = (info) => {
      if (version === runVersion && info?.codec)
        probedCodec.value = String(info.codec);
    };
    player.on_ready_show_done_callback = () => {
      if (version === runVersion) sdkReady.value = true;
    };
    player.on_error_callback = (error) => {
      if (version !== runVersion) return;
      sdkError.value =
        `软件解码失败：${error instanceof Error ? error.message : JSON.stringify(error)}`;
    };
    const width = hostRef.value.clientWidth || 640;
    const height = hostRef.value.clientHeight || 360;
    const ok = player.build({
      player_id: hostId,
      base_url: SDK_BASE,
      wasm_js_uri: `${SDK_BASE}h265web_wasm.js`,
      wasm_wasm_uri: `${SDK_BASE}h265web_wasm.wasm`,
      width,
      height,
      color: '#111111',
      auto_play: false,
      ignore_audio: false,
      // 后台预览优先保证任何浏览器都能看到画面，直接指定 HEVC 软件解码核。
      core: 'wasm_hevc',
    });
    if (!ok) throw new Error('播放器初始化失败');
    player.set_voice?.(0);
    player.load_media(props.src);
  } catch (error) {
    if (version === runVersion)
      sdkError.value =
        error instanceof Error ? error.message : 'HEVC 播放器初始化失败';
  }
}

function clearNativeWatchdog() {
  if (nativeTimer !== undefined) {
    window.clearTimeout(nativeTimer);
    nativeTimer = undefined;
  }
  const video = nativeRef.value as (HTMLVideoElement & {
    cancelVideoFrameCallback?: (handle: number) => void;
  }) | null;
  if (frameHandle !== undefined && video?.cancelVideoFrameCallback) {
    try {
      video.cancelVideoFrameCallback(frameHandle);
    } catch {
      // 浏览器可能已回收该视频元素。
    }
  }
  frameHandle = undefined;
}

function onNativePlaying(event: Event) {
  if (useSdk.value || !isHevc()) return;
  clearNativeWatchdog();
  frameSeen = false;
  const video = event.target as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  };
  if (!video.requestVideoFrameCallback) return;
  frameHandle = video.requestVideoFrameCallback(() => {
    frameSeen = true;
    clearNativeWatchdog();
  });
  // 浏览器声明支持 HEVC 但实际解不出画面时，video 会静音黑屏且不触发 error。
  nativeTimer = window.setTimeout(() => {
    if (!frameSeen && !useSdk.value && isHevc()) onNativeError();
  }, 3000);
}

function onNativeError() {
  clearNativeWatchdog();
  if (useSdk.value) return;
  releasePlayer();
  useSdk.value = true;
}

function switchNative() {
  releasePlayer();
  useSdk.value = false;
}

watch(
  () => [props.src, props.codec],
  () => {
    releasePlayer();
    sdkError.value = '';
    useSdk.value = Boolean(props.src && isHevc() && !nativeCanPlayHevc());
  },
  { immediate: true },
);
watch(
  useSdk,
  (value) => {
    if (!mounted.value) return;
    if (value) void setupSdk();
    else releasePlayer();
  },
  // 等宿主 div 真正渲染出来后再初始化 SDK，避免从原生播放切换过来时拿不到节点。
  { flush: 'post' },
);
onMounted(() => {
  mounted.value = true;
  if (useSdk.value) void setupSdk();
});
onBeforeUnmount(() => {
  mounted.value = false;
  releasePlayer();
});
</script>

<template>
  <div class="hevc-video">
    <video
      v-if="!useSdk && src"
      ref="nativeRef"
      :src="src"
      controls
      playsinline
      preload="metadata"
      @playing="onNativePlaying"
      @error="onNativeError"
    ></video>
    <div v-if="!useSdk && isHevc() && src" class="hevc-toolbar">
      <span>若画面黑屏，可切换软件解码</span>
      <ElButton link size="small" @click="onNativeError">切换软件解码</ElButton>
    </div>
    <div v-else-if="useSdk" class="hevc-sdk">
      <div :id="hostId" ref="hostRef" class="hevc-sdk-host"></div>
      <div class="hevc-toolbar">
        <span>{{
          sdkReady
            ? `HEVC 软件解码${probedCodec ? `（探测编码：${probedCodec}）` : ''}`
            : 'HEVC 软件解码加载中…'
        }}</span>
        <ElButton link size="small" @click="switchNative">尝试原生播放</ElButton>
      </div>
      <ElAlert
        v-if="sdkError"
        :title="sdkError"
        type="warning"
        :closable="false"
      />
    </div>
    <p v-else class="hevc-empty">暂无视频</p>
  </div>
</template>

<style scoped>
.hevc-video {
  width: 100%;
}

.hevc-video video {
  display: block;
  width: 100%;
  max-height: 50vh;
  background: #111;
  border-radius: 6px;
}

.hevc-sdk-host {
  width: 100%;
  min-height: 300px;
  overflow: hidden;
  background: #111;
  border-radius: 6px;
}

.hevc-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.hevc-empty {
  padding: 24px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}
</style>
