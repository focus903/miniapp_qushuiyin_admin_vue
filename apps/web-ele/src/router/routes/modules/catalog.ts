import type { RouteRecordRaw } from 'vue-router';
const page = () => import('#/views/creatorhub/catalog.vue');
const routes: RouteRecordRaw[] = [
 { name: 'TtsCatalog', path: '/tts', meta: { title: '配音管理', icon: 'lucide:audio-lines', order: 6 }, children: [
  ...[['providers','配音厂家'],['voices','音色管理'],['categories','分类管理'],['relations','分类关联'],['samples','试听文件']].map(([resource,title]) => ({ name: `Tts${resource}`, path: `/tts/${resource}`, component: page, meta: { title: title!, resource: resource!, permission: 'tts:read' } })),
 ] },
 { name: 'StorageCatalog', path: '/storage', meta: { title: '存储管理', icon: 'lucide:database', order: 7 }, children: [
  ...[['buckets','存储桶配置'],['uploads','上传记录']].map(([resource,title]) => ({ name: `Storage${resource}`, path: `/storage/${resource}`, component: page, meta: { title: title!, resource: resource!, permission: 'storage:read' } })),
 ] },
];
export default routes;
