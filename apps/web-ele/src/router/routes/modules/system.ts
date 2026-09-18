import type { RouteRecordRaw } from 'vue-router';
const routes:RouteRecordRaw[]=[
{path:'/creatorhub/app-config',name:'CreatorHubAppConfig',component:()=>import('#/views/creatorhub/system.vue'),meta:{title:'小程序配置',resource:'app-config',permission:'app-config:read',icon:'lucide:smartphone',order:9}},
{path:'/creatorhub/system',name:'CreatorHubSystem',component:()=>import('#/views/creatorhub/system.vue'),meta:{title:'系统管理',resource:'system',permission:'admin:manage',icon:'lucide:shield-check',order:10}},
];
export default routes;

