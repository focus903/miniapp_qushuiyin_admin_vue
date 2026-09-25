import type { RouteRecordRaw } from 'vue-router';
import operations from './operations';
import catalog from './catalog';
import system from './system';
const page = () => import('#/views/creatorhub/manage.vue');
const config = (name:string,path:string,title:string,resource:string):RouteRecordRaw => ({name,path,component:page,meta:{title,permission:`${resource}:read`,resource}});
const routes: RouteRecordRaw[] = [
 ...operations.filter(route=>route.name==='CreatorHubDashboard'),
 ...system.filter(route=>route.meta?.resource==='error-logs'),
 {name:'UserManagement',path:'/user-management',meta:{title:'用户管理',icon:'lucide:users',order:1},children:operations.filter(route=>route.name==='CreatorHubUsers')},
 {name:'PointsManagement',path:'/points',meta:{title:'积分管理',icon:'lucide:coins',order:2},children:[
  config('Billing','/configuration/feature-billing','功能费用','feature-billing'),
  config('Rewards','/configuration/point-rewards','签到与奖励','point-rewards'),
  config('Packages','/configuration/point-packages','充值套餐','point-packages'),
  ...operations.filter(route=>['PointRecords','RechargeRecords'].includes(String(route.name))),
 ]},
 {name:'MembershipManagement',path:'/memberships',meta:{title:'会员管理',icon:'lucide:crown',order:3},children:[
  config('MembershipPlans','/configuration/membership-plans','会员套餐','membership-plans'),
  config('MembershipEntitlements','/configuration/membership-entitlements','次数与时长权益','membership-entitlements'),
  ...operations.filter(route=>route.name==='MembershipRecords'),
 ]},
 ...operations.filter(route=>['ParseOperations','VideoOperations'].includes(String(route.name))),
 ...catalog,
 ...system.filter(route=>route.meta?.resource==='app-config'),
 {name:'SystemManagement',path:'/system',meta:{title:'系统管理',icon:'lucide:shield-check',order:10},children:[
  ...system.filter(route=>!['app-config','error-logs'].includes(String(route.meta?.resource))),
  {name:'AdminLogs',path:'/operation-logs',component:page,meta:{title:'操作日志',permission:'logs:read',resource:'logs'}},
 ]},
];
export default routes;
