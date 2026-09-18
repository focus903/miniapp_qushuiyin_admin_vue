import type { RouteRecordRaw } from 'vue-router';
const page=()=>import('#/views/creatorhub/operations.vue');
const routes:RouteRecordRaw[]=[
{name:'CreatorHubDashboard',path:'/dashboard',component:page,meta:{title:'数据概览',resource:'dashboard',permission:'dashboard:read',icon:'lucide:layout-dashboard',order:0}},
{name:'CreatorHubUsers',path:'/users',component:page,meta:{title:'用户管理',resource:'users',permission:'users:read',icon:'lucide:users',order:1}},
{name:'ParseOperations',path:'/parse-records',component:page,meta:{title:'解析管理',resource:'parses',permission:'operations:read',icon:'lucide:link',order:4}},
{name:'VideoOperations',path:'/video-tasks',component:page,meta:{title:'视频任务',resource:'tasks',permission:'tasks:read',icon:'lucide:video',order:5}},
{name:'PointRecords',path:'/points/records',component:page,meta:{title:'积分流水',resource:'points',permission:'points:read',icon:'lucide:coins',order:6}},
{name:'MembershipRecords',path:'/memberships/records',component:page,meta:{title:'会员记录',resource:'memberships',permission:'membership:read',icon:'lucide:crown',order:7}},
{name:'RechargeRecords',path:'/points/orders',component:page,meta:{title:'充值订单',resource:'orders',permission:'points:read',icon:'lucide:receipt',order:8}},
];
export default routes;
