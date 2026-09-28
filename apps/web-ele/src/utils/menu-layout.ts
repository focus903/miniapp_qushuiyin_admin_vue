import type { RouteRecordRaw } from 'vue-router';

export interface MenuPage { kind: 'page'; id: string; label: string; icon?: string }
export interface MenuGroup { kind: 'group'; id: string; label: string; icon?: string; children: MenuPage[] }
export type MenuItem = MenuPage | MenuGroup;
export interface MenuLayoutResult { revision: number; items: MenuItem[]; ready: boolean }

/** 此目录只提供已注册的页面地址、组件及权限，不生成菜单布局。 */
export function pageCatalog(routes: RouteRecordRaw[]): Map<string, RouteRecordRaw> {
  return new Map(routes.flatMap(route => route.children ?? [route]).map(route => [route.path, route]));
}

/** 布局完全来自数据库；缺失或不兼容时明确失败，不自动补回代码菜单。 */
export function normalizeLayout(routes: RouteRecordRaw[], saved: MenuItem[]): MenuItem[] {
  if (!Array.isArray(saved) || !saved.length) throw new Error('数据库菜单未初始化');
  const pages = pageCatalog(routes);
  const used = new Set<string>();
  const groups = new Set<string>();
  const page = (item: MenuPage): MenuPage => {
    if (item.kind !== 'page' || !pages.has(item.id) || used.has(item.id) || !item.label?.trim()) {
      throw new Error('数据库菜单与当前页面版本不一致');
    }
    used.add(item.id);
    return { kind: 'page', id: item.id, label: item.label, icon: item.icon ?? '' };
  };
  return saved.map(item => {
    if (item.kind === 'page') return page(item);
    if (item.kind !== 'group' || groups.has(item.id) || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id)
      || !item.label?.trim() || !Array.isArray(item.children)) throw new Error('数据库菜单分组无效');
    groups.add(item.id);
    return { kind: 'group', id: item.id, label: item.label, icon: item.icon ?? '', children: item.children.map(page) };
  });
}

export function applyLayout(routes: RouteRecordRaw[], saved: MenuItem[]): RouteRecordRaw[] {
  const pages = pageCatalog(routes);
  const leaf = (item: MenuPage, order: number): RouteRecordRaw => {
    const original = pages.get(item.id)!;
    return { ...original, meta: { ...original.meta, title: item.label, icon: item.icon ?? '', order } };
  };
  return normalizeLayout(routes, saved).map((item, order) => {
    if (item.kind === 'page') return leaf(item, order);
    return { name: `MenuGroup_${item.id}`, path: `/menu-group/${item.id}`,
      meta: { title: item.label, icon: item.icon ?? '', order },
      children: item.children.map(leaf) } as RouteRecordRaw;
  });
}
