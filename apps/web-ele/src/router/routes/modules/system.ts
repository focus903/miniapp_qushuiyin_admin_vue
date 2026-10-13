import type { RouteRecordRaw } from 'vue-router';
const routes:RouteRecordRaw[]=[
{path:'/creatorhub/scheduled-tasks',name:'CreatorHubScheduledTasks',component:()=>import('#/views/creatorhub/scheduled-tasks.vue'),meta:{title:'定时任务',resource:'scheduled-tasks',permission:'scheduled-tasks:read',icon:'lucide:clock',order:0.65}},
{path:'/creatorhub/proxy-pool',name:'CreatorHubProxyPool',component:()=>import('#/views/creatorhub/proxy-pool.vue'),meta:{title:'IP代理池',resource:'proxy-pool',permission:'proxy-pool:read',icon:'lucide:network',order:0.8}},
{path:'/creatorhub/menu-layout',name:'CreatorHubMenuLayout',component:()=>import('#/views/creatorhub/menu-layout.vue'),meta:{title:'菜单管理',resource:'menu-layout',permission:'menu-layout:read',icon:'lucide:list-tree'}},
{path:'/creatorhub/websocket-config',name:'CreatorHubWebSocketConfig',component:()=>import('#/views/creatorhub/websocket-config.vue'),meta:{title:'websocket连接配置',resource:'websocket-config',permission:'websocket-config:read',icon:'lucide:radio',order:0.6}},
{path:'/creatorhub/worker-nodes',name:'CreatorHubWorkerNodes',component:()=>import('#/views/creatorhub/worker-nodes.vue'),meta:{title:'任务节点',resource:'worker-nodes',permission:'worker-nodes:read',icon:'lucide:network',order:0.75}},
{path:'/creatorhub/error-logs',name:'CreatorHubErrorLogs',component:()=>import('#/views/creatorhub/error-logs.vue'),meta:{title:'错误日志',resource:'error-logs',permission:'error-logs:read',icon:'lucide:bug',order:0.5}},
{path:'/creatorhub/image-diagnostics',name:'CreatorHubImageDiagnostics',component:()=>import('#/views/creatorhub/image-diagnostics.vue'),meta:{title:'图像处理检测',resource:'image-diagnostics',permission:'image-diagnostics:read',icon:'lucide:scan-eye'}},
{path:'/creatorhub/database',name:'CreatorHubDatabase',component:()=>import('#/views/creatorhub/database.vue'),meta:{title:'数据库管理',resource:'database',permission:'database:read',icon:'lucide:database-backup'}},
{path:'/creatorhub/app-config',name:'CreatorHubAppConfig',component:()=>import('#/views/creatorhub/system.vue'),meta:{title:'小程序配置',resource:'app-config',permission:'app-config:read',icon:'lucide:smartphone',order:9}},
{path:'/creatorhub/system',name:'CreatorHubSystem',component:()=>import('#/views/creatorhub/system.vue'),meta:{title:'管理员',resource:'admins',permission:'admins:read',icon:'lucide:shield-check',order:10}},
{path:'/creatorhub/roles',name:'CreatorHubRoles',component:()=>import('#/views/creatorhub/system.vue'),meta:{title:'角色权限',resource:'roles',permission:'roles:read'}},
];
export default routes;

