<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElCard,
  ElInput,
  ElMessage,
} from 'element-plus';

import { requestClient } from '#/api/request';
import CopyValue from '#/components/copy-value.vue';

const router = useRouter();
const access = useAccessStore();
const goNodes = () => router.push('/creatorhub/worker-nodes');
const canCreateNode = () => access.accessCodes.includes('worker-nodes:update');
const nodeName = ref('gpu-node-1');
const creatingNode = ref(false);
const createdNode = ref<{ id: string; token: string } | null>(null);
const createNodeError = ref('');
async function createNode() {
  const name = nodeName.value.trim() || 'gpu-node-1';
  creatingNode.value = true;
  createNodeError.value = '';
  try {
    const result = await requestClient.post<{ id: string; token: string }>(
      '/system/worker-nodes',
      { name },
    );
    createdNode.value = result;
    ElMessage.success('节点已创建，请立即复制凭据');
  } catch (error) {
    createNodeError.value =
      error instanceof Error ? error.message : '创建失败，请稍后重试';
    ElMessage.error(createNodeError.value);
  } finally {
    creatingNode.value = false;
  }
}

type ModelGroup = { name: string; note: string; commands: { label: string; value: string }[] };
type Step = {
  title: string;
  desc: string;
  commands?: { label: string; value: string }[];
  groups?: ModelGroup[];
  tip?: string;
  button?: string;
  quickCreate?: boolean;
};
const steps: Step[] = [
  {
    title: '1. 准备一台机器',
    desc: '可以是按量计费的云服务器或闲置电脑（推荐 Linux x86_64）。去字幕/去水印会把视频修复计算挪到这台机器，主站 CPU 不再被打满；具体用哪个引擎由后台切换。',
    commands: [
      {
        label: '克隆后端项目（Gitee，HTTPS + 私人令牌）',
        value: 'git clone https://focusfei:你的私人令牌@gitee.com/focusfei/miniapp_qushuiyin_api_python.git --depth 1',
      },
      {
        label: '克隆中断时改用 HTTP/1.1（推荐重试）',
        value: 'git -c http.version=HTTP/1.1 -c http.postBuffer=524288000 -c http.lowSpeedLimit=0 -c http.lowSpeedTime=999999 clone --depth 1 https://focusfei:你的私人令牌@gitee.com/focusfei/miniapp_qushuiyin_api_python.git',
      },
      {
        label: '备用：下载 ZIP（可断点续传）',
        value: 'curl -L --retry 10 --retry-all-errors -C - -o repo.zip "https://gitee.com/api/v5/repos/focusfei/miniapp_qushuiyin_api_python/zipball/master?access_token=你的私人令牌" && unzip -q repo.zip',
      },
    ],
    tip: '报 curl 56 GnuTLS recv error (-54) / fetch-pack EOF，是网络中断或 Gitee 提前关闭连接（认证已通过，不是令牌错）。先重试第一条；仍失败就用 HTTP/1.1 那条；再不行用 ZIP 备用命令。ZIP 解压后进入实际目录继续第 2 步。私人令牌：Gitee 右上角头像 → 设置 → 私人令牌 → 生成新令牌，勾选 projects 权限（只显示一次）。SSH（git@）在部分云服务器 22 端口不通会卡住，故用 HTTPS。',
  },
  {
    title: '2. 同步项目并安装依赖',
    desc: '把后端项目 miniapp_qushuiyin_api_python 拷到这台机器，进入项目根目录后安装节点专用依赖（不含主站服务、数据库和云 SDK）：',
    commands: [
      {
        label: '创建虚拟环境',
        value: 'cd /root/work_node\npython3 -m venv .venv',
      },
      {
        label: '安装节点依赖（Python 3.11+）',
        value: '.venv/bin/python -m pip install -r requirements-worker.txt',
      },
      {
        label: '国内镜像（官方源慢或无法下载时用）',
        value: '.venv/bin/python -m pip install -r requirements-worker.txt -i https://pypi.tuna.tsinghua.edu.cn/simple',
      },
    ],
    tip: '官方源慢或下载不了时，用下面的国内镜像命令；两个源装出的依赖完全一样。/root/work_node 指节点上放后端项目的目录，请换成你的实际路径（如 ~/projects/miniapp_qushuiyin_api_python）。节点不连数据库，不需要 MySQL 账号，不要装主站 requirements.txt（其中 numpy==2.5.3 要求 Python 3.12）。Windows 机器把 .venv/bin/python 换成 .venv\\Scripts\\python.exe。',
  },
  {
    title: '3. 在主站创建节点凭据',
    desc: '方式一：直接在下方填写名称并点击按钮创建；方式二：在【主站】后端项目根目录执行命令行。节点名称自定义：',
    quickCreate: true,
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
    title: '5. 安装模型',
    desc: '先运行检查脚本，确认 CPU 核心、内存、是否有 NVIDIA GPU，以及三个模型是否已安装；再根据结果选择下面的安装命令（脚本最后会给出 --device 建议）。视频去水印/去字幕可切换 LaMa / STTN / ProPainter / OpenCV。前三者模型不会随代码拷贝，需在这台节点机器按需安装；OpenCV 不需要安装模型或独立环境，节点基础环境 requirements.txt 已包含 opencv-python：',
    commands: [
      {
        label: '检查机器环境（Linux）',
        value: '.venv/bin/python commands/check_worker_env.py',
      },
      {
        label: '检查机器环境（Windows）',
        value: '.venv\\Scripts\\python.exe commands\\check_worker_env.py',
      },
    ],
    groups: [
      {
        name: 'LaMa',
        note: '图片修复、视频逐帧修复；动画类效果好。',
        commands: [
          { label: 'CPU', value: '.venv/bin/python commands/install_lama.py --device cpu' },
          { label: 'CPU · 国内镜像', value: '.venv/bin/python commands/install_lama.py --device cpu --torch-index https://mirrors.aliyun.com/pytorch-wheels --pypi-index https://pypi.tuna.tsinghua.edu.cn/simple' },
          { label: 'GPU（推荐）', value: '.venv/bin/python commands/install_lama.py --device cuda' },
          { label: 'GPU（推荐） · 国内镜像', value: '.venv/bin/python commands/install_lama.py --device cuda --torch-index https://mirrors.aliyun.com/pytorch-wheels --pypi-index https://pypi.tuna.tsinghua.edu.cn/simple' },
        ],
      },
      {
        name: 'STTN',
        note: '真人视频时序修复，速度快；需 N 卡获合理耗时。',
        commands: [
          { label: 'CPU', value: '.venv/bin/python commands/install_sttn.py --device cpu' },
          { label: 'CPU · 国内镜像', value: '.venv/bin/python commands/install_sttn.py --device cpu --torch-index https://mirrors.aliyun.com/pytorch-wheels --pypi-index https://pypi.tuna.tsinghua.edu.cn/simple' },
          { label: 'GPU（推荐）', value: '.venv/bin/python commands/install_sttn.py --device cuda' },
          { label: 'GPU（推荐） · 国内镜像', value: '.venv/bin/python commands/install_sttn.py --device cuda --torch-index https://mirrors.aliyun.com/pytorch-wheels --pypi-index https://pypi.tuna.tsinghua.edu.cn/simple' },
        ],
      },
      {
        name: 'ProPainter',
        note: '运动剧烈视频最稳；显存要求高，建议 12GB 以上。',
        commands: [
          { label: 'CPU', value: '.venv/bin/python commands/install_propainter.py --device cpu' },
          { label: 'CPU · 国内镜像', value: '.venv/bin/python commands/install_propainter.py --device cpu --torch-index https://mirrors.aliyun.com/pytorch-wheels --pypi-index https://pypi.tuna.tsinghua.edu.cn/simple' },
          { label: 'GPU（推荐）', value: '.venv/bin/python commands/install_propainter.py --device cuda' },
          { label: 'GPU（推荐） · 国内镜像', value: '.venv/bin/python commands/install_propainter.py --device cuda --torch-index https://mirrors.aliyun.com/pytorch-wheels --pypi-index https://pypi.tuna.tsinghua.edu.cn/simple' },
        ],
      },
    ],
    tip: '检查脚本只读本机信息，不联网、不需要额外依赖；看到 NVIDIA GPU 才选 cuda 命令，只有 CPU 或显存不足就选 cpu。模型装在 data/tools/{lama,sttn,propainter}/，与机器绑定：换机器、换系统、CPU 改 GPU 都要重装。Windows 把 .venv/bin/python 换成 .venv\\Scripts\\python.exe。',
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
      title="工作节点把视频去字幕/去水印这类 CPU 密集任务派到独立机器执行，本机只做调度。节点跑的仍是 LaMa/STTN/ProPainter/OpenCV 本地模型，不调用云端付费 API。"
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
      <div v-if="step.quickCreate" class="quick-create">
        <template v-if="canCreateNode()">
          <div v-if="createdNode" class="created-box">
            <div class="created-line">
              <span>节点ID：</span>
              <CopyValue :value="createdNode.id" label="复制节点ID">{{ createdNode.id }}</CopyValue>
            </div>
            <div class="created-line">
              <span>凭据（仅显示一次）：</span>
              <CopyValue :value="createdNode.token" label="复制凭据">{{ createdNode.token }}</CopyValue>
            </div>
          </div>
          <div class="quick-row">
            <ElInput v-model="nodeName" placeholder="节点名称，如 gpu-node-1" maxlength="100" clearable />
            <ElButton type="primary" :loading="creatingNode" @click="createNode">
              在主站直接创建节点
            </ElButton>
          </div>
          <p v-if="createNodeError" class="create-error">{{ createNodeError }}</p>
          <p class="quick-tip">创建结果会显示在上方按钮之前，请立即复制凭据；下方命令行是另一种可选方式。</p>
        </template>
        <p v-else class="quick-tip">当前账号没有「配置处理功能」权限，请联系管理员，或使用下方命令行方式创建。</p>
      </div>
      <div v-for="cmd in step.commands || []" :key="cmd.label" class="cmd">
        <CopyValue :value="cmd.value" label="复制命令">
          {{ cmd.label }}
        </CopyValue>
        <pre>{{ cmd.value }}</pre>
      </div>
      <div v-if="step.groups" class="model-grid">
        <div v-for="group in step.groups" :key="group.name" class="model-col">
          <div class="model-name">{{ group.name }}</div>
          <p class="model-note">{{ group.note }}</p>
          <template v-for="(cmd, index) in group.commands" :key="cmd.label">
            <hr v-if="index === 2" class="model-divider" />
            <div class="cmd">
              <CopyValue :value="cmd.value" label="复制命令">
                {{ cmd.label }}
              </CopyValue>
              <pre>{{ cmd.value }}</pre>
            </div>
          </template>
        </div>
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
.worker-guide {
  width: 100%;
  max-width: 1920px;
}

.quick-create {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.quick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.quick-row :deep(.el-input) {
  max-width: 320px;
}

.created-box {
  margin-bottom: 10px;
  padding: 8px 10px;
  background: var(--el-color-primary-light-9);
  border-radius: 4px;
}

.created-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: baseline;
  font-size: 13px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.created-line > span {
  flex: none;
  color: var(--el-text-color-secondary);
}

.create-error {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--el-color-danger);
}

.quick-tip {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.model-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 4px 0 12px;
}

.model-col {
  min-width: 0;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.model-name {
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 600;
}

.model-note {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.model-col .cmd {
  margin-bottom: 8px;
}

.model-col .cmd pre {
  font-size: 12px;
}

.model-divider {
  border: 0;
  border-top: 2px solid var(--el-color-primary-light-5);
  margin: 16px 0;
}

@media (max-width: 900px) {
  .model-grid {
    grid-template-columns: 1fr;
  }
}

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
