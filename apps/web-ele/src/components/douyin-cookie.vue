<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElAlert, ElButton, ElCard, ElForm, ElFormItem, ElInput, ElMessage, ElMessageBox } from 'element-plus';
import { requestClient } from '#/api/request';

const props = defineProps<{ canSave: boolean }>();
type Status = { configured: boolean; source: 'database' | 'none'; updated: number | null; encryption_ready: boolean; storage_ready: boolean };
type Probe = { parsed: boolean; media_type: string | null; image_count: number; video_count: number; reason: string | null; message: string };
const path = '/system/douyin-cookie';
const status = ref<Status>();
const cookie = ref('');
const shareText = ref('');
const probe = ref<Probe | null>(null);
const working = ref(false);
const loading = ref(false);
const error = ref('');
type ScanStatus = { session_id: string; state: 'starting' | 'waiting' | 'scanned' | 'saving' | 'saved' | 'failed' | 'expired' | 'cancelled'; qr_image: string | null; message: string; expires_at: number };
const scan = ref<ScanStatus | null>(null);
const scanBusy = ref(false);
const scanPending = computed(() => !!scan.value && ['starting', 'waiting', 'scanned', 'saving'].includes(scan.value.state));
const scanPath = `${path}/login`;
const scanLabels = { starting: '正在启动抖音扫码浏览器…', waiting: '请使用抖音 App 扫码，并在手机上确认登录。', scanned: '已扫码，请在手机上确认登录。', saving: '正在加密保存 Cookie…', saved: '抖音登录态已保存', failed: '自动获取失败，请查看提示或改用手动获取 Cookie。', expired: '二维码已过期，请刷新后重试。', cancelled: '扫码已取消' };
const qrImage = computed(() => /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(scan.value?.qr_image || '') ? scan.value?.qr_image : null);
let scanTimer: ReturnType<typeof setTimeout> | undefined;
let scanGeneration = 0;
let active = true;
function stopPolling() { if (scanTimer) clearTimeout(scanTimer); scanTimer = undefined; }
function cancelRemote(sessionId: string) { return requestClient.delete<ScanStatus>(scanPath, { params: { session_id: sessionId } }); }
onBeforeUnmount(() => {
  active = false; cookie.value = ''; shareText.value = ''; probe.value = null; scanGeneration++; stopPolling();
  if (scan.value && scanPending.value) void cancelRemote(scan.value.session_id).catch(() => {});
  scan.value = null;
});
onMounted(load);
async function load() {
  if (loading.value || working.value) return;
  loading.value = true; error.value = ''; probe.value = null;
  try {
    const value = await requestClient.get<Status>(path);
    if (active) status.value = value;
  } catch (e) { if (active) error.value = e instanceof Error ? e.message : '登录态配置加载失败'; }
  finally { if (active) loading.value = false; }
}
async function save() {
  if (!props.canSave || working.value || loading.value || scanBusy.value || scanPending.value || !status.value?.storage_ready || !status.value.encryption_ready) return;
  const value = cookie.value.trim();
  if (!value || /[^\x20-\x7e]/.test(value) || /^Cookie:|^Set-Cookie:/i.test(value)) {
    ElMessage.error('请填写请求标头中 Cookie 的完整单行值，不包含 Cookie: 前缀'); return;
  }
  working.value = true; error.value = ''; cookie.value = ''; probe.value = null;
  try {
    const valueStatus = await requestClient.put<Status>(path, { cookie: value });
    if (active) { status.value = valueStatus; ElMessage.success('登录态已加密保存，新请求生效；请测试目标作品'); }
  } catch (e) { if (active) error.value = e instanceof Error ? e.message : '保存失败'; }
  finally { if (active) working.value = false; }
}
async function clearCookie() {
  if (!props.canSave || working.value || loading.value || scanBusy.value || scanPending.value || !status.value?.configured) return;
  try { await ElMessageBox.confirm('清除后台保存的抖音 Cookie？后续解析将回到匿名及原专用浏览器流程。', '确认清除登录态', { type: 'warning' }); }
  catch { return; }
  if (!active || working.value || scanBusy.value || scanPending.value) return;
  working.value = true; error.value = ''; cookie.value = ''; probe.value = null;
  try {
    const value = await requestClient.delete<Status>(path);
    if (active) { status.value = value; ElMessage.success('已清除后台抖音 Cookie'); }
  } catch (e) { if (active) error.value = e instanceof Error ? e.message : '清除失败'; }
  finally { if (active) working.value = false; }
}
async function testTarget() {
  if (!props.canSave || working.value || loading.value || scanBusy.value || scanPending.value || !status.value?.configured || !shareText.value.trim() || cookie.value.trim()) return;
  working.value = true; error.value = ''; probe.value = null;
  try {
    const value = await requestClient.post<Probe>(`${path}/test`, { url: shareText.value.trim() }, { timeout: 120000 });
    if (active) probe.value = value;
  } catch (e) { if (active) error.value = e instanceof Error ? e.message : '解析测试失败'; }
  finally { if (active) working.value = false; }
}
async function applyScan(value: ScanStatus, generation: number) {
  if (!active || generation !== scanGeneration) return;
  scan.value = value;
  if (value.state === 'saved') {
    cookie.value = ''; probe.value = null;
    ElMessage.success(value.message || '抖音登录态已保存');
    const latest = await requestClient.get<Status>(path);
    if (active && generation === scanGeneration) status.value = latest;
  } else if (scanPending.value) {
    scanTimer = setTimeout(() => { void pollScan(generation); }, 2000);
  }
}
async function pollScan(generation: number) {
  const session = scan.value;
  if (!active || generation !== scanGeneration || !session) return;
  try { await applyScan(await requestClient.get<ScanStatus>(scanPath, { params: { session_id: session.session_id } }), generation); }
  catch (e) {
    if (active && generation === scanGeneration) {
      error.value = e instanceof Error ? e.message : '扫码状态读取失败，请重新开始';
      if (scan.value?.state !== 'saved') {
        scan.value = { ...session, qr_image: null, message: '扫码状态读取失败，正在取消会话；若取消失败，请重试取消或等待最多3分钟后重新获取。' };
        await cancelScan();
      }
    }
  }
}
async function startScan() {
  if (!props.canSave || !active || loading.value || working.value || scanBusy.value || scanPending.value || !status.value?.storage_ready || !status.value.encryption_ready) return;
  stopPolling(); scanBusy.value = true; error.value = ''; scan.value = null; probe.value = null;
  const generation = ++scanGeneration;
  try {
    const value = await requestClient.post<ScanStatus>(scanPath);
    if (!active || generation !== scanGeneration) { void cancelRemote(value.session_id).catch(() => {}); return; }
    await applyScan(value, generation);
  } catch (e) { if (active && generation === scanGeneration) error.value = e instanceof Error ? e.message : '扫码启动失败，请改用手动获取 Cookie'; }
  finally { if (active && generation === scanGeneration) scanBusy.value = false; }
}
async function cancelScan() {
  if (!props.canSave || !active || !scan.value || scanBusy.value) return;
  stopPolling(); scanBusy.value = true;
  const generation = ++scanGeneration;
  try { await applyScan(await cancelRemote(scan.value.session_id), generation); }
  catch (e) { if (active && generation === scanGeneration) error.value = e instanceof Error ? e.message : '取消扫码失败，请重试'; }
  finally { if (active && generation === scanGeneration) scanBusy.value = false; }
}
async function refreshScan() {
  if (!props.canSave || working.value || scanBusy.value) return;
  if (scanPending.value) await cancelScan();
  if (!scanPending.value && scan.value?.state !== 'saved') await startScan();
}
</script>

<template>
  <ElCard shadow="never" v-loading="loading">
    <ElAlert title="已配置不代表登录态有效。Cookie 用于临时浏览器访问目标作品，仍可能受到作品可见性或平台验证限制。" type="info" :closable="false" class="mb-3" />
    <ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-3" />
    <p class="mb-3">后台抖音 Cookie：{{ status?.configured ? '已配置（有效性待测试）' : '未配置' }}
      <span v-if="status?.updated"> · 更新于 {{ new Date(status.updated * 1000).toLocaleString() }}</span>
    </p>
    <ElAlert v-if="status && !status.storage_ready" title="请先执行抖音凭据表迁移，再保存登录态。" type="warning" :closable="false" class="mb-3" />
    <ElAlert v-if="status && !status.encryption_ready" title="服务端需配置 DOUYIN_COOKIE_ENCRYPTION_KEY 或 ADMIN_JWT_SECRET。" type="warning" :closable="false" class="mb-3" />
    <section class="cookie-help cookie-scan mb-4">
      <h4>1. 扫码自动获取</h4>
      <p class="mb-3">用抖音 App 扫描二维码，并在手机确认登录后，自动加密保存 Cookie，与手动获取共用同一份配置。每次最多等待3分钟；取消、超时或验证未通过时保留原配置。</p>
      <template v-if="canSave">
        <div class="flex flex-wrap gap-2">
          <ElButton type="primary" :loading="scanBusy" :disabled="loading || working || scanPending || !status?.storage_ready || !status.encryption_ready" @click="startScan">{{ scan ? '重新扫码' : '自动获取 Cookie' }}</ElButton>
          <ElButton v-if="scanPending" :disabled="scanBusy || working || scan?.state === 'saving'" @click="refreshScan">刷新二维码</ElButton>
          <ElButton v-if="scanPending" :disabled="scanBusy" @click="cancelScan">取消扫码</ElButton>
        </div>
        <div v-if="scan" aria-live="polite" class="mt-3">
          <img v-if="qrImage" :src="qrImage" alt="抖音登录二维码" class="cookie-qr" />
          <ElAlert :title="scan.message || scanLabels[scan.state]" :type="scan.state === 'saved' ? 'success' : ['failed', 'expired'].includes(scan.state) ? 'warning' : 'info'" :closable="false" class="mt-3" />
          <p v-if="scanPending">会话截止：{{ new Date(scan.expires_at * 1000).toLocaleTimeString() }}。关闭弹窗会取消等待中的会话；若已开始保存，会等待该次保存完成。</p>
        </div>
      </template>
      <p>如果抖音要求人工验证码或安全验证，自动获取会停止，请使用下方手动方式。扫码保存成功后，仍需测试目标作品是否可以解析。</p>
    </section>
    <section class="cookie-help mb-4">
      <h4>2. 手动获取 Cookie</h4>
      <ol>
        <li>使用 Chrome／Edge 打开 <a href="https://www.douyin.com/" target="_blank" rel="noopener noreferrer">抖音官网</a>，手动登录并确认目标作品可以打开。</li>
        <li>按 F12 打开开发者工具，选择“网络 / Network”，再刷新作品页面。</li>
        <li>选择发往 www.douyin.com 的请求，在“请求标头 / Request Headers”中复制 Cookie 的完整值。</li>
        <li>粘贴到下方并保存，再使用同一分享链接测试。不要复制响应的 Set-Cookie，也不要包含“Cookie:”前缀。</li>
      </ol>
      <p>仅复制抖音自己的 Cookie。它等同登录凭据，请勿发给他人；后台不回显已保存内容。</p>
    <template v-if="canSave">
      <ElForm label-position="top">
        <ElFormItem label="更新抖音 Cookie">
          <ElInput v-model="cookie" type="password" autocomplete="new-password" :maxlength="32768" :disabled="working || scanBusy || scanPending" placeholder="粘贴完整单行 Cookie；已保存值不会回显" />
        </ElFormItem>
      </ElForm>
      <div class="mb-4 flex flex-wrap gap-2">
        <ElButton type="primary" :loading="working" :disabled="loading || scanBusy || scanPending || !cookie.trim() || !status?.storage_ready || !status.encryption_ready" @click="save">保存登录态</ElButton>
      </div>
    </template>
    </section>
    <template v-if="canSave">
      <div class="mb-4 flex flex-wrap gap-2">
        <ElButton type="danger" plain :disabled="loading || working || scanBusy || scanPending || !status?.configured" @click="clearCookie">清除登录态</ElButton>
        <ElButton :disabled="loading || working || scanBusy || scanPending" @click="load">刷新状态</ElButton>
      </div>
      <ElForm label-position="top">
        <ElFormItem label="测试目标作品（使用已保存 Cookie）">
          <ElInput v-model="shareText" type="textarea" :rows="3" :maxlength="10000" :disabled="working || scanBusy || scanPending" placeholder="粘贴抖音视频或图文的完整分享内容" />
        </ElFormItem>
      </ElForm>
      <ElButton :loading="working" :disabled="loading || scanBusy || scanPending || !status?.configured || !shareText.trim() || !!cookie.trim()" @click="testTarget">测试解析</ElButton>
      <p class="mt-2 text-sm">输入了新 Cookie 时请先保存。测试不扣积分、不生成用户解析记录、不保存业务媒体文件；浏览器会正常加载作品数据，可能需要等待约2分钟。</p>
      <ElAlert v-if="probe" :title="probe.message" :type="probe.parsed ? 'success' : 'warning'" :closable="false" class="mt-3" />
      <p v-if="probe?.parsed" class="mt-2">取得 {{ probe.image_count }} 张图片、{{ probe.video_count }} 个视频地址。实况图可能同时包含图片和短视频；此处不会展示凭据或媒体签名地址。</p>
    </template>
    <p class="mt-3 text-sm">Cookie 单独加密保存，新请求读取最新配置，无需重启。过期后重新登录并更新；清除不会删除原专用浏览器会话，已开始的请求仍可能使用此前读取的登录态。</p>
  </ElCard>
</template>

<style scoped>
.cookie-help { padding: 14px; border: 1px solid var(--el-border-color-light); border-radius: 8px; }
.cookie-help h4 { font-weight: 600; margin-bottom: 8px; }
.cookie-help ol { padding-left: 20px; list-style: decimal; }
.cookie-help li + li { margin-top: 6px; }
.cookie-help a { color: var(--el-color-primary); text-decoration: underline; }
.cookie-help p { margin-top: 10px; color: var(--el-text-color-secondary); }
.cookie-scan { border-color: var(--el-color-primary-light-5); }
.cookie-qr { width: 240px; max-width: 100%; display: block; margin: 0 auto; padding: 10px; background: white; border-radius: 8px; }
</style>
