import { useStorage } from '@vueuse/core';

/** 页面内 Tab 选中项本地持久化：切换菜单再切回时保持原选择。 */
export function usePersistedTab<T extends string>(key: string, fallback: T) {
  return useStorage<T>(`creatorhub:tab:${key}`, fallback);
}
