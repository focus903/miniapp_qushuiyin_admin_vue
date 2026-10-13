import type { RouteRecordRaw } from 'vue-router';
const page=()=>import('#/views/creatorhub/operations.vue');
const routes:RouteRecordRaw[]=[
{name:'CreatorHubDashboard',path:'/dashboard',component:page,meta:{title:'数据概览',resource:'dashboard',permission:'dashboard:read',icon:'lucide:layout-dashboard',order:0}},
{name:'CreatorHubUsers',path:'/users',component:page,meta:{title:'用户列表',resource:'users',permission:'users:read',icon:'lucide:users',order:1}},
{name:'ParseOperations',path:'/parses',meta:{title:'解析管理',icon:'lucide:link',order:4},children:[
 ...[['parses','/parse-records','用户解析记录'],['resources','/parse-resources','共享资源'],['files','/parse-files','关联文件']].map(([resource,path,title])=>({name:`Parse${resource}`,path:path!,component:page,meta:{title:title!,resource:resource!,permission:`${resource}:read`}})),
]},
{name:'VideoOperations',path:'/video',meta:{title:'视频任务',icon:'lucide:video',order:5},children:[
 {name:'VideoTranscriptRecords',path:'/transcript-records',component:()=>import('#/views/creatorhub/transcript-records.vue'),meta:{title:'视频文案提取记录',permission:'transcripts:read'}},
 ...[['subtitle','/video-tasks','视频去字幕'],['watermark','/watermark-tasks','视频去水印']].map(([resource,path,title])=>({name:`Video${resource}`,path:path!,component:page,meta:{title:title!,resource:resource!,permission:`${resource}:read`}})),
]},
{name:'PointRecords',path:'/points/records',component:page,meta:{title:'积分流水',resource:'points',permission:'points:read',icon:'lucide:coins',order:6}},
{name:'ImageOperations',path:'/images',meta:{title:'图片任务',icon:'lucide:images',order:5.5},children:[
 ...[['repair','/creatorhub/image-records','图片去水印','image_repair'],['large','/creatorhub/image-records/large','图片高清','image_large'],['compress','/creatorhub/image-records/compress','图片压缩','image_compress'],['ocr','/creatorhub/image-records/ocr','图片文字识别','image_ocr']].map(([name,path,title,imageKind])=>({name:`Image${name}`,path:path!,component:()=>import('#/views/creatorhub/image-records.vue'),meta:{title:title!,imageKind:imageKind!,resource:'image-records',permission:'image-records:read'}})),
]},
{name:'MembershipRecords',path:'/memberships/records',component:page,meta:{title:'会员记录',resource:'memberships',permission:'membership:read',icon:'lucide:crown',order:7}},
{name:'RechargeRecords',path:'/points/orders',component:page,meta:{title:'充值订单',resource:'orders',permission:'orders:read',icon:'lucide:receipt',order:8}},
];
export default routes;
