<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElAlert, ElButton, ElCard, ElForm, ElFormItem, ElInput, ElMessage } from 'element-plus';
import { requestClient } from '#/api/request';

const props = defineProps<{ canSave: boolean }>();
type Status = { configured: boolean; source: 'database' | 'environment' | 'none'; updated: number | null; encryption_ready: boolean; storage_ready: boolean; environment_configured: boolean };
const status = ref<Status>();
const databaseConfigured = computed(() => status.value?.source === 'database');
const cookie = ref('');
const busy = ref(false);
const saving = ref(false);
const error = ref('');
type ScanStatus = { session_id: string; state: 'starting' | 'waiting' | 'scanned' | 'saving' | 'saved' | 'failed' | 'expired' | 'cancelled'; qr_image: string | null; message: string; expires_at: number };
const scan = ref<ScanStatus>();
const scanBusy = ref(false);
const scanPending = computed(() => !!scan.value && ['starting', 'waiting', 'scanned', 'saving'].includes(scan.value.state));
const scanLabels = { starting: '正在启动登录浏览器…', waiting: '请用微信扫码，并在手机上确认登录。', scanned: '已扫码，请在手机上确认登录。', saving: '正在加密保存登录态…', saved: '登录态已保存', failed: '扫码登录失败', expired: '扫码登录已超时', cancelled: '扫码登录已取消' };
let scanTimer: ReturnType<typeof setTimeout> | undefined;
let scanGeneration = 0;
const scanPath = '/system/wechat-cookie/login';
let active = true;
function stopPolling() { if (scanTimer) clearTimeout(scanTimer); scanTimer = undefined; }
async function cancelRemote(sessionId: string) {
  return requestClient.delete<ScanStatus>(scanPath, { params: { session_id: sessionId } });
}
onBeforeUnmount(() => {
  active = false; cookie.value = ''; scanGeneration++; stopPolling();
  if (scan.value && scanPending.value) void cancelRemote(scan.value.session_id).catch(() => {});
});
onMounted(async () => {
  busy.value = true;
  try {
    const result = await requestClient.get<Status>('/system/wechat-cookie');
    if (active) status.value = result;
  } catch (e) {
    if (active) error.value = e instanceof Error ? e.message : '登录态配置加载失败';
  } finally { if (active) busy.value = false; }
});
async function save() {
  if (!props.canSave || saving.value || scanBusy.value || scanPending.value || !status.value?.storage_ready || !status.value.encryption_ready) return;
  const value = cookie.value.trim();
  if (!value || /[\r\n\0]/.test(value)) { ElMessage.error('请填写完整的单行 Cookie'); return; }
  saving.value = true; error.value = ''; cookie.value = '';
  try {
    const result = await requestClient.put<Status>('/system/wechat-cookie', { cookie: value });
    if (active) { status.value = result; ElMessage.success('登录态已更新，新解析请求生效'); }
  } catch (e) {
    if (active) error.value = e instanceof Error ? e.message : '登录态保存失败，请重新输入后重试';
  } finally { if (active) saving.value = false; }
}
async function applyScan(value: ScanStatus, generation: number) {
  if (!active || generation !== scanGeneration) return;
  scan.value = value;
  if (value.state === 'saved') {
    cookie.value = '';
    ElMessage.success(value.message || '元宝登录态已加密保存');
    const result = await requestClient.get<Status>('/system/wechat-cookie');
    if (active && generation === scanGeneration) status.value = result;
  } else if (scanPending.value) {
    scanTimer = setTimeout(() => { void pollScan(generation); }, 2000);
  }
}
async function pollScan(generation: number) {
  const session = scan.value;
  if (!active || generation !== scanGeneration || !session) return;
  try {
    const result = await requestClient.get<ScanStatus>(scanPath, { params: { session_id: session.session_id } });
    await applyScan(result, generation);
  } catch (e) {
    if (active && generation === scanGeneration) {
      error.value = e instanceof Error ? e.message : '扫码状态获取失败，请重新开始';
      if (scan.value?.state !== 'saved') {
        scan.value = { ...session, qr_image: null, message: '扫码状态获取失败，正在取消会话；若取消失败，请点击“取消扫码”重试。' };
        await cancelScan();
      }
    }
  }
}
async function startScan() {
  if (!props.canSave || saving.value || scanBusy.value || scanPending.value || !status.value?.storage_ready || !status.value.encryption_ready) return;
  stopPolling(); scanBusy.value = true; error.value = ''; scan.value = undefined;
  const generation = ++scanGeneration;
  try {
    const result = await requestClient.post<ScanStatus>(scanPath);
    if (!active || generation !== scanGeneration) { void cancelRemote(result.session_id).catch(() => {}); return; }
    await applyScan(result, generation);
  } catch (e) {
    if (active && generation === scanGeneration) error.value = e instanceof Error ? e.message : '扫码登录启动失败，请重试';
  } finally { if (active && generation === scanGeneration) scanBusy.value = false; }
}
async function cancelScan() {
  if (!scan.value || scanBusy.value) return;
  stopPolling(); scanBusy.value = true;
  const generation = ++scanGeneration;
  try { await applyScan(await cancelRemote(scan.value.session_id), generation); }
  catch (e) { if (active && generation === scanGeneration) error.value = e instanceof Error ? e.message : '取消扫码失败，请重试'; }
  finally { if (active && generation === scanGeneration) scanBusy.value = false; }
}
</script>

<template>
  <ElCard v-loading="busy" class="mb-4" header="视频号登录态">
    <div class="cookie-priority mb-3 text-sm">
      <strong>配置优先级：数据库优先，其次环境变量</strong>
      <p><span class="cookie-badge database">方式1、2 · 数据库</span> 扫码自动获取和手动获取都会将 Cookie 加密保存到数据库，共用同一份配置；最后一次成功保存的内容生效，新请求立即读取，无需重启。</p>
      <p><span class="cookie-badge terminal">方式3 · 环境变量</span> 数据库未保存 Cookie 时，才读取服务进程的 YUANBAO_COOKIE。Bash／WSL 和 systemd 属于同一优先级，根据启动方式选择。</p>
      <p>数据库中已保存但凭据解密失败时会报错，不会自动切换到环境变量。</p>
    </div>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-3" />
    <p class="mb-3">元宝 Cookie：{{ status?.configured ? '已配置' : '未配置' }}
      <span v-if="status?.source === 'environment'">（环境变量）</span>
      <span v-if="status?.updated"> · 更新于 {{ new Date(status.updated * 1000).toLocaleString() }}</span>
    </p>
    <ElAlert v-if="status && !status.storage_ready" title="请先执行视频号凭据表迁移，才能保存后台登录态。" type="warning" :closable="false" class="mb-3" />
    <ElAlert v-if="status && !status.encryption_ready" title="服务端尚未配置凭据加密密钥。" type="warning" :closable="false" class="mb-3" />
    <section v-if="canSave" class="cookie-scan mb-3 text-sm">
      <h4 class="cookie-method-title mb-2">1. 扫码自动获取（试用）<span class="cookie-badge" :class="databaseConfigured ? 'database' : 'unconfigured'">{{ !status ? '加载中' : databaseConfigured ? '已配置（共用后台 Cookie）' : '未配置' }}</span></h4>
      <p class="mb-3">用微信扫描下方二维码，在手机确认登录元宝后，系统自动将 Cookie 加密保存到数据库。二维码最多等待3分钟；保存成功前保留原配置。</p>
      <ElButton type="primary" :loading="scanBusy" :disabled="busy || saving || scanPending || !status?.storage_ready || !status.encryption_ready" @click="startScan">{{ scan ? '重新扫码' : '自动获取 Cookie' }}</ElButton>
      <ElButton v-if="scanPending" :disabled="scanBusy" @click="cancelScan">取消扫码</ElButton>
      <div v-if="scan" class="mt-3" aria-live="polite">
        <img v-if="scan.qr_image" :src="scan.qr_image" class="cookie-qr" alt="元宝微信登录二维码" />
        <ElAlert :title="scan.message || scanLabels[scan.state]" :type="scan.state === 'saved' ? 'success' : ['failed', 'expired'].includes(scan.state) ? 'warning' : 'info'" :closable="false" class="mt-2" />
        <p v-if="scanPending" class="mt-2">会话截止：{{ new Date(scan.expires_at * 1000).toLocaleTimeString() }}。关闭弹窗会取消等待中的扫码会话。</p>
      </div>
    </section>
    <section class="cookie-manual mb-3 text-sm">
    <div class="cookie-login mb-3">
      <h4 class="cookie-method-title mb-2">2. 手动获取 Cookie<span class="cookie-badge" :class="databaseConfigured ? 'database' : 'unconfigured'">{{ !status ? '加载中' : databaseConfigured ? '已配置（共用后台 Cookie）' : '未配置' }}</span></h4>
      <a href="https://yuanbao.tencent.com/" target="_blank" rel="noopener noreferrer">打开元宝官网登录</a>
      <ol>
        <li>用 Chrome／Edge 打开元宝官网并登录。</li>
        <li>按 F12（或 Ctrl + Shift + I）打开开发者工具，选择“网络 / Network”，再刷新元宝页面。</li>
        <li>选择发往 yuanbao.tencent.com 的 Fetch／XHR 请求，在“标头 / Headers”中找到“请求标头 / Request Headers”的 Cookie。</li>
        <li>复制 Cookie 的完整值（不包含“Cookie:”前缀），粘贴到下方输入框并点击“保存登录态”。若未看到 Cookie，换一个请求或在页面发送消息后查看。</li>
      </ol>
      <p>复制的是请求中的 Cookie，不是响应中的 Set-Cookie；Cookie 等同登录凭据，请勿发给他人。</p>
    </div>
    <template v-if="canSave">
      <ElForm label-position="top" class="cookie-form">
      <ElFormItem label="更新元宝 Cookie">
        <ElInput v-model="cookie" type="password" show-password autocomplete="new-password" :maxlength="32768" placeholder="输入新的完整 Cookie；已保存内容不会回显" :disabled="saving || scanBusy || scanPending" />
      </ElFormItem>
      </ElForm>
      <ElButton type="primary" :loading="saving" :disabled="busy || scanBusy || scanPending || !cookie.trim() || !status?.storage_ready || !status.encryption_ready" @click="save">保存登录态</ElButton>
    </template>
    <p class="mt-3 text-sm">Cookie 加密保存到数据库，仅供服务端解析使用；失效后在此更新，新请求生效，无需重启。</p>
    <p class="mt-2 text-sm">扫码与手动获取共用一份数据库配置，上方标记表示是否已保存，不区分历史获取方式。</p>
    </section>
    <section class="cookie-environment text-sm">
    <h4 class="cookie-method-title mb-2">3. 环境变量<span class="cookie-badge" :class="status?.environment_configured ? 'database' : 'unconfigured'">{{ !status ? '加载中' : status.environment_configured ? '已配置' : '未配置' }}</span><span v-if="status?.environment_configured" class="cookie-badge" :class="databaseConfigured ? 'systemd' : 'terminal'">{{ databaseConfigured ? '未生效：后台 Cookie 优先' : '当前使用' }}</span></h4>
    <div class="cookie-help-grid mt-3 text-sm">
      <section class="cookie-help-panel terminal-panel">
      <h4><span class="cookie-badge terminal">Bash／WSL 手动启动</span></h4>
      <p>在终端执行以下命令，输入时不会显示 Cookie：</p>
      <pre>read -r -s -p "粘贴元宝 Cookie：" YUANBAO_COOKIE
printf '\n'
export YUANBAO_COOKIE</pre>
      <p>然后在同一终端启动后端或文字提取节点。仅对当前终端及其启动的进程有效，不会影响 systemd 服务。</p>
      </section>
      <section class="cookie-help-panel systemd-panel">
        <h4><span class="cookie-badge systemd">systemd 服务启动</span></h4>
        <p>如果服务已有 EnvironmentFile，将变量加入该文件；否则创建专用文件：</p>
        <pre>sudo nano /etc/creatorhub-yuanbao.env</pre>
        <p>写入以下内容，将占位文字替换为完整 Cookie：</p>
        <pre>YUANBAO_COOKIE="粘贴完整 Cookie"</pre>
        <p>限制文件权限，并配置服务（将“服务名”替换为实际名称）：</p>
        <pre>sudo chmod 600 /etc/creatorhub-yuanbao.env
sudo systemctl edit &lt;服务名&gt;</pre>
        <p>在服务覆盖配置中添加：</p>
        <pre>[Service]
EnvironmentFile=/etc/creatorhub-yuanbao.env</pre>
        <p>加载配置并重启服务：</p>
        <pre>sudo systemctl daemon-reload
sudo systemctl restart &lt;服务名&gt;</pre>
        <p>后端和独立文字提取节点都需配置。之后更新 Cookie，只需修改环境文件并重启对应服务；后台保存方式无需重启。</p>
      </section>
    </div>
    </section>
  </ElCard>
</template>

<style scoped>
.cookie-form { width: 100%; }
.cookie-method-title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-weight: 600; }
.cookie-manual, .cookie-environment { padding: 14px; border: 1px solid var(--el-border-color-light); border-radius: 8px; }
.unconfigured { color: var(--el-text-color-secondary); background: var(--el-fill-color-light); }
.cookie-scan { padding: 14px; border: 1px solid var(--el-color-primary-light-5); border-radius: 8px; }
.cookie-qr { display: block; width: 240px; max-width: 100%; height: auto; margin: 0 auto; padding: 12px; border-radius: 8px; background: white; }
.cookie-login a { color: var(--el-color-primary); text-decoration: underline; }
.cookie-login ol { margin: 8px 0; padding-left: 20px; list-style: decimal; }
.cookie-login li + li { margin-top: 4px; }
.cookie-login p { color: var(--el-text-color-secondary); }
.cookie-priority { padding: 12px; border-radius: 8px; background: var(--el-fill-color-light); }
.cookie-priority p { margin-top: 8px; }
.cookie-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
.database { color: var(--el-color-success); background: var(--el-color-success-light-9); }
.terminal { color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.systemd { color: var(--el-color-warning); background: var(--el-color-warning-light-9); }
.cookie-help-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.cookie-help-panel { min-width: 0; padding: 14px; border: 1px solid var(--el-border-color-light); border-radius: 8px; }
.terminal-panel { border-top: 3px solid var(--el-color-primary); }
.systemd-panel { border-top: 3px solid var(--el-color-warning); }
.cookie-help-panel h4 { margin-bottom: 12px; }
.cookie-help-panel pre { margin: 8px 0; padding: 12px; overflow-x: auto; border-radius: 6px; background: var(--el-fill-color-light); }
@media (max-width: 768px) { .cookie-help-grid { grid-template-columns: 1fr; } }
</style>
