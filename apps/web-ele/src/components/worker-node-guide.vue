<script setup lang="ts">
import { useRouter } from 'vue-router';

import { ElAlert, ElButton, ElCard } from 'element-plus';

import CopyValue from '#/components/copy-value.vue';

const router = useRouter();
const goNodes = () => router.push('/creatorhub/worker-nodes');

type Step = {
  title: string;
  desc: string;
  commands?: { label: string; value: string }[];
  tip?: string;
  button?: string;
};
const steps: Step[] = [
  {
    title: '1. 准备一台机器',
    desc: '可以是按量计费的云服务器或闲置电脑（推荐 Linux x86_64）。去字幕/去水印会把 LaMa 逐帧推理挪到这台机器，主站 CPU 不再被打满。',
  },
  {
    title: '2. 同步项目并安装依赖',
    desc: '把后端项目 miniapp_qushuiyin_api_python 整个拷到这台机器，进入项目根目录后执行：',
    commands: [
      {
        label: '安装 Python 依赖',
        value:
          '.venv/bin/python -m pip install -r requirements.txt && .venv/bin/python -m pip install websockets==15.0.1',
      },
    ],
    tip: '节点不连数据库，不需要 MySQL 账号。Windows 机器把 .venv/bin/python 换成 .venv\\Scripts\\python.exe。',
  },
  {
    title: '3. 在主站创建节点凭据',
    desc: '在【主站】后端项目根目录执行，节点名称自定义：',
    commands: [
      {
        label: '创建节点（Linux）',
        value:
          '.venv/bin/python commands/manage_worker/main.py create gpu-node-1',
      },
      {
        label: '创建节点（Windows）',
        value:
          '.venv\\Scripts\\python.exe commands\\manage_worker\\main.py create gpu-node-1',
      },
    ],
    tip: '输出的 token 只显示一次，请立即复制保存，下一步要用。可在「任务节点」页面重命名/禁用/轮换凭据。',
  },
  {
    title: '4. 配置节点连接主站',
    desc: '在【工作节点机器】项目根目录的 .env 中写入（没有就新建）：',
    commands: [
      {
        label: '.env 配置',
        value:
          'WORKER_SERVER_URL=wss://你的后端域名/ws/worker\nWORKER_TOKEN=上一步复制的凭据\nWORKER_MAX_CONCURRENT_TASKS=1',
      },
    ],
    tip: '本机测试可用 ws://127.0.0.1:8001/ws/worker；远程机器必须用 wss://，不能用 ws://。',
  },
  {
    title: '5. 安装 LaMa 模型',
    desc: '视频去字幕/去水印默认用 LaMa 引擎。模型不会随代码拷贝，需在这台节点机器上单独安装：',
    commands: [
      {
        label: 'CPU 机器',
        value: '.venv/bin/python commands/install_lama.py --device cpu',
      },
      {
        label: 'GPU 机器（推荐，快几十倍）',
        value: '.venv/bin/python commands/install_lama.py --device cuda',
      },
    ],
    tip: '模型装在 data/tools/lama/，和机器绑定：换机器、换系统、CPU 改 GPU 都要重装一遍。只用 OpenCV 引擎可跳过这步。',
  },
  {
    title: '6. 启动节点',
    desc: '在【工作节点机器】项目根目录执行：',
    commands: [
      {
        label: '启动（Linux）',
        value: 'bash commands/worker_client/start.sh',
      },
      {
        label: '前台单次运行（调试）',
        value: 'bash commands/worker_client/start.sh --once',
      },
    ],
    tip: '看到节点连接成功即可。保持进程运行；退出后节点会离线。',
  },
  {
    title: '7. 主站切换到 worker',
    desc: '回到顶部「视频处理」Tab，把对应任务的「执行位置」选为 worker · 远程工作节点，点「保存视频处理配置」。新提交的任务即由节点处理，已提交任务保留原来的设置。',
  },
  {
    title: '8. 确认节点在线',
    desc: '节点连上后，到这里查看在线状态、当前任务和耗时明细：',
    button: '打开任务节点页面',
  },
];
</script>
<template>
  <div class="worker-guide">
    <ElAlert
      title="工作节点把视频去字幕/去水印这类 CPU 密集任务派到独立机器执行，本机只做调度。节点跑的仍是 LaMa/OpenCV 本地模型，不调用云端付费 API。"
      type="info"
      :closable="false"
      show-icon
      class="mb-4"
    />
    <ElCard
      v-for="step in steps"
      :key="step.title"
      shadow="never"
      class="step-card mb-4"
    >
      <template #header>
        <span class="step-title">{{ step.title }}</span>
      </template>
      <p class="desc">{{ step.desc }}</p>
      <div v-for="cmd in step.commands || []" :key="cmd.label" class="cmd">
        <CopyValue :value="cmd.value" label="复制命令">
          {{ cmd.label }}
        </CopyValue>
        <pre>{{ cmd.value }}</pre>
      </div>
      <p v-if="step.tip" class="tip">{{ step.tip }}</p>
      <ElButton v-if="step.button" type="primary" plain @click="goNodes">
        {{ step.button }}
      </ElButton>
    </ElCard>
    <ElAlert
      title="远程节点必须使用 HTTPS/WSS：主站 Nginx 需代理 /ws/worker（含其下载子路径），并保留 Authorization、X-Worker-Session、X-Worker-Lease 请求头。worker 模式下「视频处理」Tab 显示「未验证远程环境」属正常，环境检查不会探测远程节点；请到「任务节点」页面看节点是否在线。"
      type="warning"
      :closable="false"
      show-icon
    />
  </div>
</template>
<style scoped>
.step-title {
  font-size: 15px;
  font-weight: 600;
}

.desc {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--el-text-color-regular);
}

.cmd {
  margin-bottom: 12px;
  font-size: 13px;
}

.cmd pre {
  padding: 8px 10px;
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.tip {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}

.step-card :deep(.el-card__body) {
  padding-top: 8px;
}
</style>
