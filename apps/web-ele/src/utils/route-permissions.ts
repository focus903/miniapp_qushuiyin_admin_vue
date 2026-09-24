interface PermissionRoute {meta?:Record<string,unknown>;children?:PermissionRoute[]}
/** 按页面查看权限过滤菜单，并移除没有可访问子页的父菜单。 */
export function allowedRoutes<T extends PermissionRoute>(routes:T[],codes:string[]):T[]{
 return routes.filter(route=>!route.meta?.permission||codes.includes(String(route.meta.permission)))
 .map(route=>({...route,...(route.children?{children:allowedRoutes(route.children,codes)}:{})}) as T)
 .filter(route=>!route.children||route.children.length>0);
}
