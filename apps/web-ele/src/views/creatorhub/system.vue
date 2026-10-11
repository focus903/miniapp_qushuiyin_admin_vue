<script setup lang="ts">
import PermissionTree from '#/components/permission-tree.vue';
import WechatCookie from '#/components/wechat-cookie.vue';
import AppConfigField from '#/components/app-config-field.vue';
import { configTabs } from '#/utils/app-config-layout';
import type { ConfigSchema, ConfigValues } from '#/utils/app-config-layout';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useAccessStore } from '@vben/stores';
import { ElAlert, ElButton, ElCard, ElDialog, ElForm, ElFormItem, ElInput, ElMessage, ElMessageBox, ElOption, ElPagination, ElSelect, ElSwitch, ElTable, ElTableColumn, ElTabs, ElTabPane } from 'element-plus';
import { requestClient } from '#/api/request';
type Admin = {id:string;username:string;enabled:number;roles:string[];created:number};
type Role = {code:string;name:string;permissions:string[]};
type Config = ConfigValues;
const route=useRoute();const access=useAccessStore();
const isConfig=computed(()=>route.meta.resource==='app-config');
const canSave=computed(()=>access.accessCodes.includes(isConfig.value?'app-config:update':route.meta.resource==='roles'?'roles:update':'admins:update'));
const busy=ref(false);const saving=ref(false);const error=ref('');const page=ref(1);const total=ref(0);const keyword=ref('');const enabled=ref<number>();
const admins=ref<Admin[]>([]);const roles=ref<Role[]>([]);const permissions=ref<{code:string;name:string}[]>([]);const config=ref<Config>({});
const tab=ref('admins');const userDialog=ref(false);const roleDialog=ref(false);const editingId=ref('');
const userForm=ref({username:'',password:'',enabled:1,roles:[] as string[]});const roleForm=ref<Role>({code:'',name:'',permissions:[]});const editingRole=ref(false);
const configTab=ref('');
const outputIcons:Record<string,{icon:string;color:string}>={
 videoOutputMode:{icon:'mdi:video',color:'var(--el-color-primary)'},
 wechatOutputMode:{icon:'simple-icons:wechat',color:'#07c160'},
 douyinOutputMode:{icon:'simple-icons:tiktok',color:'var(--el-text-color-primary)'},
 xiaohongshuOutputMode:{icon:'simple-icons:xiaohongshu',color:'#ff2442'},
 bilibiliOutputMode:{icon:'simple-icons:bilibili',color:'#fb7299'},
 kuaishouOutputMode:{icon:'simple-icons:kuaishou',color:'#ff4906'},
 xiguaOutputMode:{icon:'icon-park-outline:xigua',color:'#f5222d'},
 toutiaoOutputMode:{icon:'icon-park-outline:jinritoutiao',color:'#ed4040'},
 weiboOutputMode:{icon:'simple-icons:sinaweibo',color:'#e6162d'},
 dongchediOutputMode:{icon:'icon-park-outline:dongchedi',color:'#e6a23c'},
 pipixiaOutputMode:{icon:'icon-park-outline:shrimp',color:'#ff7a45'},
 youtubeOutputMode:{icon:'simple-icons:youtube',color:'#ff0000'},
};
const wechatCookieDialog=ref(false);
const configGeneration=ref(0);
const configLayout=ref<ReturnType<typeof configTabs>>([]);
const invalidFields=ref<Record<string,boolean>>({});
async function load(){busy.value=true;error.value='';try{
 if(isConfig.value){
  const [values,schema]=await Promise.all([requestClient.get<Config>('/system/app-config'),requestClient.get<ConfigSchema>('/system/app-config/schema')]);
  const layout=configTabs(schema);
  const outputRank=(key:string)=>key==='videoOutputMode'?0:key==='wechatOutputMode'?1:2;
  for(const group of layout.filter(item=>item.code==='video_output')){
    for(const section of [group,...group.children])section.fields.sort((a,b)=>outputRank(a.key)-outputRank(b.key));
  }
  config.value=values;configLayout.value=layout;invalidFields.value={};configGeneration.value++;
  if(!layout.some(group=>group.code===configTab.value))configTab.value=layout[0]?.code||'';
 }
 else if(route.meta.resource==='admins'){const users=await requestClient.get<{items:Admin[];total:number}>('/system/admins',{params:{page:page.value,keyword:keyword.value,enabled:enabled.value}});admins.value=users.items;total.value=users.total;if(access.accessCodes.includes('admins:create')||access.accessCodes.includes('admins:update'))roles.value=await requestClient.get<Role[]>('/system/roles');}
 else if(route.meta.resource==='roles'){roles.value=await requestClient.get<Role[]>('/system/roles');if(access.accessCodes.includes('roles:update'))permissions.value=await requestClient.get<{code:string;name:string;module:string;page:string}[]>('/system/permissions');}
}catch(e){error.value=e instanceof Error?e.message:'加载失败，请重试';}finally{busy.value=false;}}
async function toggleAdmin(row:Admin):Promise<boolean>{
 if(saving.value)return false;saving.value=true;
 try{const value=row.enabled===1?0:1;await requestClient.put(`/system/admins/${row.id}`,{enabled:value});row.enabled=value;ElMessage.success('状态已更新，该管理员已下线');return true;}
 catch{return false;}finally{saving.value=false;}
}
function editUser(row?:Admin){editingId.value=row?.id||'';userForm.value={username:row?.username||'',password:'',enabled:row?.enabled??1,roles:[...(row?.roles||[])]};userDialog.value=true;}
async function saveUser(){if(!editingId.value&&!userForm.value.password){ElMessage.error('请填写至少6位密码');return;}if(userForm.value.password&&userForm.value.password.length<6){ElMessage.error('密码至少6位');return;}saving.value=true;try{const body={username:userForm.value.username,enabled:userForm.value.enabled,roles:userForm.value.roles,...(userForm.value.password?{password:userForm.value.password}:{})};if(editingId.value)await requestClient.put(`/system/admins/${editingId.value}`,body);else await requestClient.post('/system/admins',body);userDialog.value=false;userForm.value.password='';ElMessage.success('已保存，该管理员已下线');await load();}finally{saving.value=false;}}
async function revoke(row:Admin){try{await ElMessageBox.confirm(`确定将 ${row.username} 踢下线？该账号所有已登录设备都需要重新登录。`,'确认踢下线',{type:'warning'});}catch{return;}saving.value=true;try{await requestClient.post(`/system/admins/${row.id}/revoke`);ElMessage.success('已踢下线');}finally{saving.value=false;}}
function editRole(row?:Role){editingRole.value=!!row;roleForm.value=row?{...row,permissions:[...row.permissions]}:{code:'',name:'',permissions:[]};roleDialog.value=true;}
async function saveRole(){saving.value=true;try{await requestClient.put('/system/roles',roleForm.value);roleDialog.value=false;ElMessage.success('角色已保存，关联管理员需重新登录');await load();}finally{saving.value=false;}}
async function saveConfig(){if(Object.values(invalidFields.value).some(Boolean)){ElMessage.error('请先修正配置项中的错误');return;}saving.value=true;try{await requestClient.put('/system/app-config',{values:config.value});ElMessage.success('已保存，下次请求生效');await load();}finally{saving.value=false;}}
watch(()=>route.path,()=>{page.value=1;tab.value=String(route.meta.resource);userDialog.value=false;roleDialog.value=false;load();},{immediate:true});
</script>
<template>
<Page :title="isConfig?'小程序配置':'系统管理'">
<ElAlert v-if="error" :title="error" type="error" show-icon :closable="false" class="mb-4" />
<ElCard v-loading="busy">
<template v-if="isConfig">
<ElAlert title="保存后新处理请求立即受开关控制，小程序入口需刷新用户信息后更新；历史记录及处理结果保留。功能开关与积分计费独立。配音关闭后首页入口隐藏，底部原生配音页显示暂停开放。" type="info" :closable="false" class="mb-4" />
<ElForm class="miniapp-config-form" label-position="top" :disabled="!canSave||saving">
<ElTabs v-model="configTab">
 <ElTabPane v-for="group in configLayout" :key="group.id" :label="group.label" :name="group.code">
  <ElAlert v-if="group.code==='notifications'" title="关闭固定版本：匹配用户授权时的小程序版本。开启：统一使用指定版本。旧任务或缺少有效版本时使用指定版本兜底；修改不会改变已发送的通知。" type="info" :closable="false" class="mb-4" />
  <div v-if="group.fields.length" class="config-grid">
  <AppConfigField v-for="field in group.fields.filter(item=>item.key!=='wxTaskMessageStateFixed')" :key="`${configGeneration}-${field.key}`" :field="field" :model-value="config[field.key]" @update:model-value="value=>config[field.key]=value" @validity-change="valid=>invalidFields[field.key]=!valid">
   <template #label><span class="inline-flex items-center gap-2"><IconifyIcon v-if="outputIcons[field.key]" :icon="outputIcons[field.key]!.icon" :style="{color:outputIcons[field.key]!.color}" class="size-5 shrink-0" aria-hidden="true" />{{ field.label }}</span> <span v-if="field.key==='wxTaskMessageState'" class="ml-3 inline-flex items-center gap-2 text-sm"><ElSwitch :model-value="config.wxTaskMessageStateFixed===true" @update:model-value="value=>config.wxTaskMessageStateFixed=Boolean(value)" />固定使用此版本</span> <ElButton v-if="field.key==='wechatOutputMode'" class="ml-2" size="small" type="primary" plain :disabled="false" @click="wechatCookieDialog=true">Cookie 配置</ElButton></template>
  </AppConfigField>
  </div>
  <div v-if="group.children.length" class="grid gap-4 md:grid-cols-2">
   <ElCard v-for="child in group.children" :key="child.id" class="config-section" :data-config-group="child.code" shadow="never" :header="child.label">
    <div class="config-grid">
    <AppConfigField v-for="field in child.fields" :key="`${configGeneration}-${field.key}`" :field="field" :model-value="config[field.key]" @update:model-value="value=>config[field.key]=value" @validity-change="valid=>invalidFields[field.key]=!valid">
     <template #label><span class="inline-flex items-center gap-2"><IconifyIcon v-if="outputIcons[field.key]" :icon="outputIcons[field.key]!.icon" :style="{color:outputIcons[field.key]!.color}" class="size-5 shrink-0" aria-hidden="true" />{{ field.label }}</span> <span v-if="field.key==='wxTaskMessageState'" class="ml-3 inline-flex items-center gap-2 text-sm"><ElSwitch :model-value="config.wxTaskMessageStateFixed===true" @update:model-value="value=>config.wxTaskMessageStateFixed=Boolean(value)" />固定使用此版本</span> <ElButton v-if="field.key==='wechatOutputMode'" class="ml-2" size="small" type="primary" plain :disabled="false" @click="wechatCookieDialog=true">Cookie 配置</ElButton></template>
    </AppConfigField>
    </div>
   </ElCard>
  </div>
 </ElTabPane>
</ElTabs>
<ElFormItem class="mt-4"><ElButton v-if="canSave" type="primary" :loading="saving" :disabled="busy||!!error||!configLayout.length" @click="saveConfig">保存配置</ElButton><ElButton @click="load">重新加载</ElButton></ElFormItem>
</ElForm>
</template>
<ElTabs v-else v-model="tab">
<ElTabPane v-if="route.meta.resource==='admins'" label="管理员" name="admins">
<div class="mb-4 flex flex-wrap gap-2"><ElInput v-model="keyword" placeholder="搜索账号" style="width:220px" clearable @keyup.enter="page=1;load()"/><ElSelect v-model="enabled" clearable placeholder="全部状态" style="width:140px"><ElOption label="启用" :value="1"/><ElOption label="禁用" :value="0"/></ElSelect><ElButton @click="page=1;load()">查询</ElButton><ElButton v-if="access.accessCodes.includes('admins:create')" type="primary" @click="editUser()">新增管理员</ElButton></div>
<ElTable :data="admins" empty-text="暂无管理员"><ElTableColumn prop="username" label="账号"/><ElTableColumn label="状态"><template #default="{row}"><ElSwitch :model-value="row.enabled" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="禁用" inline-prompt aria-label="管理员启用状态" :disabled="!canSave" :loading="saving" :before-change="()=>toggleAdmin(row as Admin)"/></template></ElTableColumn><ElTableColumn label="角色"><template #default="{row}">{{row.roles.map((code:string)=>roles.find(r=>r.code===code)?.name||code).join('、')||'无'}}</template></ElTableColumn><ElTableColumn label="创建时间"><template #default="{row}">{{new Date(row.created*1000).toLocaleString()}}</template></ElTableColumn><ElTableColumn v-if="canSave||access.accessCodes.includes('admins:revoke')" label="操作" width="240"><template #default="{row}"><ElButton v-if="canSave" link @click="editUser(row as Admin)">编辑 / 重置密码</ElButton><ElButton v-if="access.accessCodes.includes('admins:revoke')" link :disabled="saving" @click="revoke(row as Admin)">踢下线</ElButton></template></ElTableColumn></ElTable>
<ElPagination v-model:current-page="page" :page-size="20" :total="total" layout="total, prev, pager, next, jumper, slot" class="mt-4" @current-change="load" style="justify-content:center;flex-wrap:wrap;row-gap:8px"><ElButton size="small" :disabled="page<=1" @click="page=1;load()">首页</ElButton><ElButton size="small" :disabled="page>=Math.max(1,Math.ceil((total)/(20)))" @click="page=Math.max(1,Math.ceil((total)/(20)));load()">末页</ElButton></ElPagination>
</ElTabPane>
<ElTabPane v-if="route.meta.resource==='roles'" label="角色权限" name="roles"><ElButton v-if="canSave" type="primary" class="mb-4" @click="editRole()">新增角色</ElButton><ElTable :data="roles" empty-text="暂无角色"><ElTableColumn prop="name" label="角色"/><ElTableColumn prop="code" label="代码"/><ElTableColumn label="权限数量"><template #default="{row}">{{row.permissions.length}}</template></ElTableColumn><ElTableColumn label="操作"><template #default="{row}"><ElButton v-if="canSave" link :disabled="row.code==='superadmin'" @click="editRole(row as Role)">{{row.code==='superadmin'?'内置角色':'编辑权限'}}</ElButton></template></ElTableColumn></ElTable></ElTabPane>
</ElTabs>
</ElCard>
<ElDialog v-if="isConfig" v-model="wechatCookieDialog" title="微信视频号 Cookie 配置" width="min(1100px, 94vw)" top="5vh" destroy-on-close>
 <WechatCookie v-if="wechatCookieDialog" :can-save="canSave" />
</ElDialog>
<ElDialog v-model="userDialog" :title="editingId?'编辑管理员':'新增管理员'" width="560px" @closed="userForm.password=''">
<ElForm label-width="100px"><ElFormItem label="账号"><ElInput v-model="userForm.username" maxlength="64" autocomplete="off"/></ElFormItem><ElFormItem :label="editingId?'新密码':'密码'"><ElInput v-model="userForm.password" type="password" show-password autocomplete="new-password" :placeholder="editingId?'留空不修改；至少6位':'至少6位'"/></ElFormItem><ElFormItem label="启用"><ElSwitch v-model="userForm.enabled" :active-value="1" :inactive-value="0"/></ElFormItem><ElFormItem label="角色"><ElSelect v-model="userForm.roles" multiple style="width:100%"><ElOption v-for="role in roles" :key="role.code" :label="role.name" :value="role.code"/></ElSelect></ElFormItem></ElForm><template #footer><ElButton @click="userDialog=false">取消</ElButton><ElButton type="primary" :loading="saving" @click="saveUser">保存</ElButton></template></ElDialog>
<ElDialog v-model="roleDialog" title="角色与权限" width="620px"><ElForm label-width="100px"><ElFormItem label="角色代码"><ElInput v-model="roleForm.code" :disabled="editingRole" placeholder="3至64位小写英文、数字、下划线"/></ElFormItem><ElFormItem label="中文名称"><ElInput v-model="roleForm.name" maxlength="100"/></ElFormItem><ElFormItem label="权限"><PermissionTree v-if="roleDialog" v-model="roleForm.permissions" :permissions="permissions" /></ElFormItem></ElForm><template #footer><ElButton @click="roleDialog=false">取消</ElButton><ElButton type="primary" :loading="saving" @click="saveRole">保存</ElButton></template></ElDialog>
</Page>
</template>

<style scoped>
.config-section[data-config-group='audio_to_text'] {
  --heading-color: #1d4ed8;
  --heading-background: rgb(59 130 246 / 8%);
}
.config-section[data-config-group='text_to_audio'] {
  --heading-color: #047857;
  --heading-background: rgb(16 185 129 / 8%);
}
.dark .config-section[data-config-group='audio_to_text'] {
  --heading-color: #93c5fd;
}
.dark .config-section[data-config-group='text_to_audio'] {
  --heading-color: #6ee7b7;
}
.config-section[data-config-group='audio_to_text'] :deep(.el-card__header),
.config-section[data-config-group='text_to_audio'] :deep(.el-card__header) {
  color: var(--heading-color);
  font-weight: 600;
  background: var(--heading-background);
  border-inline-start: 4px solid var(--heading-color);
}
.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 16px;
  margin-bottom: 20px;
  align-items: start;
}
.config-grid > :deep(.el-form-item) {
  min-width: 0;
  margin-bottom: 0;
  grid-column: 1 / -1;
}
.config-grid > :deep(.config-switch) {
  grid-column: auto;
}
</style>
