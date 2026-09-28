import type { RouteRecordRaw } from 'vue-router';
import operations from './operations';
import catalog from './catalog';
import system from './system';
const page = () => import('#/views/creatorhub/manage.vue');
const config = (name:string,path:string,title:string,resource:string):RouteRecordRaw => ({name,path,component:page,meta:{title,permission:`${resource}:read`,resource}});
// 仅注册页面与权限；分组、名称和顺序由数据库菜单提供。
const routes: RouteRecordRaw[] = [
 ...operations.flatMap(route => route.children ?? [route]),
 ...catalog.flatMap(route => route.children ?? [route]),
 ...system,
 config('Billing','/configuration/feature-billing','功能费用','feature-billing'),
 config('Rewards','/configuration/point-rewards','签到与奖励','point-rewards'),
 config('Packages','/configuration/point-packages','充值套餐','point-packages'),
 config('MembershipPlans','/configuration/membership-plans','会员套餐','membership-plans'),
 config('MembershipEntitlements','/configuration/membership-entitlements','次数与时长权益','membership-entitlements'),
 {name:'AdminLogs',path:'/operation-logs',component:page,meta:{title:'操作日志',permission:'logs:read',resource:'logs'}},
];
export default routes;
