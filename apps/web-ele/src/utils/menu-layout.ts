import type { RouteRecordRaw } from 'vue-router';

export interface MenuPage {
  kind: 'page';
  id: string;
  label: string;
  icon?: string;
}
export interface MenuGroup {
  kind: 'group';
  id: string;
  label: string;
  icon?: string;
  children: MenuPage[];
}
export type MenuItem = MenuGroup | MenuPage;
export interface MenuLayoutResult {
  revision: number;
  items: MenuItem[];
  ready: boolean;
}

/** 此目录只提供已注册的页面地址、组件及权限，不生成菜单布局。 */
export function pageCatalog(
  routes: RouteRecordRaw[],
): Map<string, RouteRecordRaw> {
  return new Map(
    routes
      .flatMap((route) => route.children ?? [route])
      .map((route) => [route.path, route]),
  );
}

/** 编辑器严格校验，避免旧前端保存时丢失尚未支持的数据库菜单。 */
export function normalizeLayout(
  routes: RouteRecordRaw[],
  saved: MenuItem[],
): MenuItem[] {
  return readLayout(routes, saved);
}

function readLayout(
  routes: RouteRecordRaw[],
  saved: MenuItem[],
  onUnsupported?: (page: MenuPage) => void,
): MenuItem[] {
  if (!Array.isArray(saved) || saved.length === 0)
    throw new Error('数据库菜单未初始化，请确认已执行菜单迁移。');
  const pages = pageCatalog(routes);
  const used = new Set<string>();
  const groups = new Set<string>();
  const page = (item: MenuPage): MenuPage[] => {
    if (
      !item ||
      item.kind !== 'page' ||
      typeof item.id !== 'string' ||
      !item.id ||
      used.has(item.id) ||
      typeof item.label !== 'string' ||
      !item.label.trim()
    ) {
      throw new Error('数据库菜单页面数据无效或重复，请检查菜单配置。');
    }
    used.add(item.id);
    if (!pages.has(item.id)) {
      if (!onUnsupported)
        throw new Error(
          '数据库菜单包含当前前端版本尚未支持的页面，请更新管理前端后编辑。',
        );
      onUnsupported(item);
      return [];
    }
    return [
      { kind: 'page', id: item.id, label: item.label, icon: item.icon ?? '' },
    ];
  };
  return saved.flatMap((item): MenuItem[] => {
    if (item?.kind === 'page') return page(item);
    if (
      !item ||
      item.kind !== 'group' ||
      groups.has(item.id) ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(item.id) ||
      typeof item.label !== 'string' ||
      !item.label.trim() ||
      !Array.isArray(item.children)
    ) {
      throw new Error('数据库菜单分组无效，请检查菜单配置。');
    }
    groups.add(item.id);
    const children = item.children.flatMap(page);
    if (onUnsupported && children.length === 0) return [];
    return [
      {
        kind: 'group',
        id: item.id,
        label: item.label,
        icon: item.icon ?? '',
        children,
      },
    ];
  });
}

/** 登录时忽略当前前端未注册的页面；数据库布局和原有权限均保持不变。 */
export function applyLayout(
  routes: RouteRecordRaw[],
  saved: MenuItem[],
  onUnsupported: (page: MenuPage) => void = () => {},
): RouteRecordRaw[] {
  const pages = pageCatalog(routes);
  const leaf = (item: MenuPage, order: number): RouteRecordRaw => {
    const original = pages.get(item.id);
    if (!original)
      throw new Error('当前前端尚未支持此菜单页面，请更新管理前端。');
    return {
      ...original,
      meta: {
        ...original.meta,
        title: item.label,
        icon: item.icon ?? '',
        order,
      },
    };
  };
  const items = readLayout(routes, saved, onUnsupported);
  if (items.length === 0)
    throw new Error('当前前端没有可用页面，请更新管理前端后重试。');
  return items.map((item, order) => {
    if (item.kind === 'page') return leaf(item, order);
    return {
      name: `MenuGroup_${item.id}`,
      path: `/menu-group/${item.id}`,
      meta: { title: item.label, icon: item.icon ?? '', order },
      children: item.children.map(leaf),
    } as RouteRecordRaw;
  });
}
