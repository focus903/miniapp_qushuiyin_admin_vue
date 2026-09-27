import { onUnmounted, readonly, ref, watch } from 'vue';
import { useAppConfig } from '@vben/hooks';
import { useAccessStore } from '@vben/stores';
import { requestClient } from '#/api/request';
import { AdminSocket, adminSocketUrl, type ConnectionStatus } from './admin-socket';

const state = ref<ConnectionStatus>('disconnected');
const listeners = new Set<(event: string) => void>();
export const adminRealtimeState = readonly(state);
export function subscribeAdminEvents(listener: (event: string) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** 仅在后台主布局调用；页面订阅消息而不创建连接。 */
export function useAdminRealtime() {
  const access = useAccessStore();
  const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
  const client = new AdminSocket({
    url: () => adminSocketUrl(apiURL, window.location.origin),
    token: () => access.accessToken,
    verify: async () => {
      // 只验证会话，避免旧请求覆盖切换账户后的权限。
      await requestClient.get<string[]>('/auth/codes');
    },
    status: (value) => { state.value = value; },
    event: (event) => { for (const listener of [...listeners]) listener(event); },
  });
  const unwatch = watch(() => access.accessToken, (token) => {
    client.stop();
    if (token) client.start();
  }, { immediate: true, flush: 'sync' });
  onUnmounted(() => { unwatch(); client.stop(); });
}
