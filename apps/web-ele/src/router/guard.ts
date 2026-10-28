import type { Router } from 'vue-router';

import type { MenuLayoutResult } from '#/utils/menu-layout';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';
import { startProgress, stopProgress } from '@vben/utils';

import { ElMessage } from 'element-plus';

import { getAccessCodesApi, refreshTokenApi } from '#/api/core/auth';
import { requestClient } from '#/api/request';
import { accessRoutes, coreRouteNames } from '#/router/routes';
import { useAuthStore } from '#/store';
import { applyLayout } from '#/utils/menu-layout';
import { allowedRoutes } from '#/utils/route-permissions';

import { generateAccess } from './access';

/**
 * 通用守卫配置
 * @param router
 */
function setupCommonGuard(router: Router) {
  // 记录已经加载的页面
  const loadedPaths = new Set<string>();

  router.beforeEach((to) => {
    to.meta.loaded = loadedPaths.has(to.path);

    // 页面加载进度条
    if (!to.meta.loaded && preferences.transition.progress) {
      startProgress();
    }
    return true;
  });

  router.afterEach((to) => {
    // 记录页面是否加载,如果已经加载，后续的页面切换动画等效果不在重复执行

    loadedPaths.add(to.path);

    // 关闭页面加载进度条
    if (preferences.transition.progress) {
      stopProgress();
    }
  });
}

/**
 * 权限访问守卫配置
 * @param router
 */
function setupAccessGuard(router: Router) {
  let restored = false;
  router.beforeEach(async (to, from) => {
    const accessStore = useAccessStore();
    const userStore = useUserStore();
    const authStore = useAuthStore();

    // 令牌只存内存；刷新页面时通过HttpOnly Cookie恢复一次会话。
    if (!restored) {
      restored = true;
      if (!accessStore.accessToken) {
        try {
          const response = await refreshTokenApi();
          accessStore.setAccessToken(response.data.accessToken);
          await authStore.fetchUserInfo();
          accessStore.setAccessCodes(await getAccessCodesApi());
        } catch {
          /* 未登录时正常进入登录页。 */
        }
      }
    }
    // 基本路由，这些路由不需要进入权限拦截
    if (coreRouteNames.includes(to.name as string)) {
      if (to.path === LOGIN_PATH && accessStore.accessToken) {
        return decodeURIComponent(
          (to.query?.redirect as string) ||
            userStore.userInfo?.homePath ||
            preferences.app.defaultHomePath,
        );
      }
      return true;
    }

    // accessToken 检查
    if (!accessStore.accessToken) {
      // 明确声明忽略权限访问权限，则可以访问
      if (to.meta.ignoreAccess) {
        return true;
      }

      // 没有访问权限，跳转登录页面
      if (to.fullPath !== LOGIN_PATH) {
        return {
          path: LOGIN_PATH,
          // 如不需要，直接删除 query
          query:
            to.fullPath === preferences.app.defaultHomePath
              ? {}
              : { redirect: encodeURIComponent(to.fullPath) },
          // 携带当前跳转的页面，登录后重新跳转该页面
          replace: true,
        };
      }
      return to;
    }

    // 是否已经生成过动态路由
    if (accessStore.isAccessChecked) {
      return true;
    }

    // 生成路由表
    // 当前登录用户拥有的角色标识列表
    const userInfo = userStore.userInfo || (await authStore.fetchUserInfo());
    const userRoles = userInfo.roles ?? [];

    let menuRoutes: typeof accessRoutes;
    try {
      const layout = await requestClient.get<MenuLayoutResult>(
        '/system/menu-layout',
      );
      if (!layout.ready)
        throw new Error('数据库菜单未初始化，请确认已执行菜单迁移。');
      let unsupportedCount = 0;
      menuRoutes = applyLayout(accessRoutes, layout.items, () => {
        unsupportedCount += 1;
      });
      if (unsupportedCount) {
        ElMessage.warning(
          `有 ${unsupportedCount} 个菜单页面需要更新管理前端，已暂时隐藏，其他页面可正常使用。`,
        );
      }
    } catch (error) {
      ElMessage.error(
        error instanceof Error
          ? error.message
          : '菜单加载失败，请检查网络连接和接口服务后刷新重试。',
      );
      return false;
    }
    // 布局调整后仍执行原有权限过滤，分组不能授予页面访问权限。
    const { accessibleMenus, accessibleRoutes } = await generateAccess({
      roles: userRoles,
      router,
      // 则会在菜单中显示，但是访问会被重定向到403
      routes: allowedRoutes(menuRoutes, accessStore.accessCodes),
    });

    // 保存菜单信息和路由信息
    accessStore.setAccessMenus(accessibleMenus);
    accessStore.setAccessRoutes(accessibleRoutes);
    accessStore.setIsAccessChecked(true);
    const redirectPath = (from.query.redirect ??
      (to.path === preferences.app.defaultHomePath
        ? userInfo.homePath || preferences.app.defaultHomePath
        : to.fullPath)) as string;

    return {
      ...router.resolve(decodeURIComponent(redirectPath)),
      replace: true,
    };
  });
}

/**
 * 项目守卫配置
 * @param router
 */
function createRouterGuard(router: Router) {
  /** 通用 */
  setupCommonGuard(router);
  /** 权限访问 */
  setupAccessGuard(router);
}

export { createRouterGuard };
