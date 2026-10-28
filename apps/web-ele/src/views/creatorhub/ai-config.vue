<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElCard, ElForm, ElTabPane, ElTabs } from 'element-plus';

import AiModelConfig from '#/components/ai-model-config.vue';
import AsrConfig from '#/components/asr-config.vue';
import ImageProcessingConfig from '#/components/image-processing-config.vue';
import VideoCloudConfig from '#/components/video-cloud-config.vue';
const access = useAccessStore();
const tab = ref('asr');
const route = useRoute();
watch(
  () => route.query.tab,
  (value) => {
    tab.value =
      typeof value === 'string' &&
      ['asr', 'image', 'llm', 'video', 'vlm'].includes(value)
        ? value
        : 'asr';
  },
  { immediate: true },
);
</script>
<template>
  <Page title="AI 服务配置">
    <ElCard>
      <ElTabs v-model="tab">
        <ElTabPane label="语音识别（ASR）" name="asr" lazy>
          <ElForm label-position="top">
            <AsrConfig
              :disabled="!access.accessCodes.includes('app-config:update')"
            />
          </ElForm>
        </ElTabPane>
        <ElTabPane label="大语言模型（LLM）" name="llm" lazy>
          <AiModelConfig
            kind="llm"
            :disabled="!access.accessCodes.includes('app-config:update')"
          />
        </ElTabPane>
        <ElTabPane label="视觉语言模型（VLM）" name="vlm" lazy>
          <AiModelConfig
            kind="vlm"
            :disabled="!access.accessCodes.includes('app-config:update')"
          />
        </ElTabPane>
        <ElTabPane label="视频处理" name="video" lazy>
          <VideoCloudConfig
            :disabled="!access.accessCodes.includes('app-config:update')"
          />
        </ElTabPane>
        <ElTabPane label="图片处理" name="image" lazy>
          <ImageProcessingConfig
            :disabled="!access.accessCodes.includes('app-config:update')"
          />
        </ElTabPane>
      </ElTabs>
    </ElCard>
  </Page>
</template>
