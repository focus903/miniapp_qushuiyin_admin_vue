import type { RouteRecordRaw } from 'vue-router';
const routes:RouteRecordRaw[]=[
{path:'/creatorhub/error-logs',name:'CreatorHubErrorLogs',component:()=>import('#/views/creatorhub/error-logs.vue'),meta:{title:'错误日志',resource:'error-logs',permission:'error-logs:read',icon:'lucide:bug'}},
{path:'/creatorhub/image-diagnostics',name:'CreatorHubImageDiagnostics',component:()=>import('#/views/creatorhub/image-diagnostics.vue'),meta:{title:'图像处理检测',resource:'image-diagnostics',permission:'image-diagnostics:read',icon:'lucide:scan-eye'}},
{path:'/creatorhub/database',name:'CreatorHubDatabase',component:()=>import('#/views/creatorhub/database.vue'),meta:{title:'数据库管理',resource:'database',permission:'database:read',icon:'lucide:database-backup'}},
{path:'/creatorhub/app-config',name:'CreatorHubAppConfig',component:()=>import('#/views/creatorhub/system.vue'),meta:{title:'小程序配置',resource:'app-config',permission:'app-config:read',icon:'lucide:smartphone',order:9}},
{path:'/creatorhub/system',name:'CreatorHubSystem',component:()=>import('#/views/creatorhub/system.vue'),meta:{title:'管理员',resource:'admins',permission:'admins:read',icon:'lucide:shield-check',order:10}},
{path:'/creatorhub/roles',name:'CreatorHubRoles',component:()=>import('#/views/creatorhub/system.vue'),meta:{title:'角色权限',resource:'roles',permission:'roles:read'}},
];
export default routes;

