<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';
import { ElAlert, ElButton, ElCard, ElDialog, ElForm, ElFormItem, ElInput, ElMessage, ElMessageBox, ElOption, ElPagination, ElSelect, ElSwitch, ElTable, ElTableColumn, ElTabs, ElTabPane } from 'element-plus';
import { requestClient } from '#/api/request';
type Admin = {id:string;username:string;enabled:number;roles:string[];created:number};
type Role = {code:string;name:string;permissions:string[]};
type Config = Record<string, boolean|string|Record<string,string>>;
const route=useRoute();const access=useAccessStore();
const isConfig=computed(()=>route.meta.resource==='app-config');
const canSave=computed(()=>access.accessCodes.includes(isConfig.value?'app-config:update':'admin:manage'));
const busy=ref(false);const saving=ref(false);const error=ref('');const page=ref(1);const total=ref(0);const keyword=ref('');const enabled=ref<number>();
const admins=ref<Admin[]>([]);const roles=ref<Role[]>([]);const permissions=ref<{code:string;name:string}[]>([]);const config=ref<Config>({});
const mappings=ref<{key:string;value:string}[]>([]);const tab=ref('admins');const userDialog=ref(false);const roleDialog=ref(false);const editingId=ref('');
const userForm=ref({username:'',password:'',enabled:1,roles:[] as string[]});const roleForm=ref<Role>({code:'',name:'',permissions:[]});const editingRole=ref(false);
const labels:Record<string,string>={placeholder:'解析输入框提示',homeNotice:'首页公告',showHomeAd:'显示首页广告',showVipCenter:'显示会员中心',showDoCharge:'显示充值入口',showTextToAudio:'显示文字转语音',showSubtitle:'开放视频去字幕',showAiWrite:'显示 AI 写作',showChatGPT:'显示智能问答',showAiText:'显示 AI 文案',showShortText:'显示短文案',showGoodsText:'显示商品文案',showHotTitle:'显示热门标题',showTextCheck:'显示文案检查',showLargeImage:'显示图片放大',showOcr:'显示图片文字识别',notificationsEnabled:'发送任务订阅通知',wxTaskTemplateId:'微信订阅模板 ID',wxTaskMessageState:'微信小程序环境'};
const switches=computed(()=>Object.keys(config.value).filter(k=>typeof config.value[k]==='boolean'));
async function load(){busy.value=true;error.value='';try{
 if(isConfig.value){config.value=await requestClient.get<Config>('/system/app-config');mappings.value=Object.entries(config.value.wxTaskTemplateFields as Record<string,string>).map(([key,value])=>({key,value}));}
 else{const [users,r,p]=await Promise.all([requestClient.get<{items:Admin[];total:number}>('/system/admins',{params:{page:page.value,keyword:keyword.value,enabled:enabled.value}}),requestClient.get<Role[]>('/system/roles'),requestClient.get<{code:string;name:string}[]>('/system/permissions')]);admins.value=users.items;total.value=users.total;roles.value=r;permissions.value=p;}
}catch(e){error.value=e instanceof Error?e.message:'加载失败，请重试';}finally{busy.value=false;}}
async function toggleAdmin(row:Admin):Promise<boolean>{
 if(saving.value)return false;saving.value=true;
 try{const value=row.enabled===1?0:1;await requestClient.put(`/system/admins/${row.id}`,{enabled:value});row.enabled=value;ElMessage.success('状态已更新，原会话已撤销');return true;}
 catch{return false;}finally{saving.value=false;}
}
function editUser(row?:Admin){editingId.value=row?.id||'';userForm.value={username:row?.username||'',password:'',enabled:row?.enabled??1,roles:[...(row?.roles||[])]};userDialog.value=true;}
async function saveUser(){if(!editingId.value&&!userForm.value.password){ElMessage.error('请填写至少12位密码');return;}if(userForm.value.password&&userForm.value.password.length<12){ElMessage.error('密码至少12位');return;}saving.value=true;try{const body={username:userForm.value.username,enabled:userForm.value.enabled,roles:userForm.value.roles,...(userForm.value.password?{password:userForm.value.password}:{})};if(editingId.value)await requestClient.put(`/system/admins/${editingId.value}`,body);else await requestClient.post('/system/admins',body);userDialog.value=false;userForm.value.password='';ElMessage.success('已保存，该账号现有会话已撤销');await load();}finally{saving.value=false;}}
async function revoke(row:Admin){try{await ElMessageBox.confirm(`撤销 ${row.username} 的全部登录会话？`,'确认撤销',{type:'warning'});}catch{return;}saving.value=true;try{await requestClient.post(`/system/admins/${row.id}/revoke`);ElMessage.success('会话已撤销');}finally{saving.value=false;}}
function editRole(row?:Role){editingRole.value=!!row;roleForm.value=row?{...row,permissions:[...row.permissions]}:{code:'',name:'',permissions:[]};roleDialog.value=true;}
async function saveRole(){saving.value=true;try{await requestClient.put('/system/roles',roleForm.value);roleDialog.value=false;ElMessage.success('角色已保存，关联管理员需重新登录');await load();}finally{saving.value=false;}}
async function saveConfig(){if(new Set(mappings.value.map(m=>m.key)).size!==mappings.value.length){ElMessage.error('模板字段不能重复');return;}saving.value=true;try{await requestClient.put('/system/app-config',{values:{...config.value,wxTaskTemplateFields:Object.fromEntries(mappings.value.map(m=>[m.key,m.value]))}});ElMessage.success('已保存，下次请求生效');await load();}finally{saving.value=false;}}
watch(()=>route.path,()=>{page.value=1;load();},{immediate:true});
</script>
<template>
<Page :title="isConfig?'小程序配置':'系统管理'">
<ElAlert v-if="error" :title="error" type="error" show-icon :closable="false" class="mb-4" />
<ElCard v-loading="busy">
<template v-if="isConfig">
<ElAlert title="保存后下次后端请求生效；小程序显示项需重新登录刷新。去字幕开关同时控制新提交与重试。入口显示不代表功能或支付已经开通。订阅通知仍需用户授权，微信 AppSecret 继续由环境配置管理。" type="info" :closable="false" class="mb-4" />
<ElForm label-width="180px" :disabled="!canSave||saving">
<ElFormItem v-for="key in switches" :key="key" :label="labels[key]||key"><ElSwitch :model-value="config[key]===true" @update:model-value="value=>config[key]=Boolean(value)" /></ElFormItem>
<ElFormItem v-for="key in ['placeholder','homeNotice','wxTaskTemplateId']" :key="key" :label="labels[key]"><ElInput :model-value="String(config[key]||'')" :type="key==='wxTaskTemplateId'?'text':'textarea'" maxlength="2000" @update:model-value="value=>config[key]=value" /></ElFormItem>
<ElFormItem label="小程序环境"><ElSelect v-model="config.wxTaskMessageState"><ElOption label="正式版" value="formal"/><ElOption label="体验版" value="trial"/><ElOption label="开发版" value="developer"/></ElSelect></ElFormItem>
<ElFormItem label="订阅模板字段映射"><div><div v-for="(mapping,index) in mappings" :key="index" class="mb-2 flex gap-2"><ElInput v-model="mapping.key" placeholder="例如 thing1"/><ElSelect v-model="mapping.value"><ElOption label="任务标题" value="title"/><ElOption label="完成状态" value="status"/><ElOption label="完成时间" value="finished"/><ElOption label="任务 ID" value="taskId"/></ElSelect><ElButton @click="mappings.splice(index,1)">移除</ElButton></div><ElButton @click="mappings.push({key:'',value:'title'})">添加字段</ElButton></div></ElFormItem>
<ElFormItem><ElButton v-if="canSave" type="primary" :loading="saving" @click="saveConfig">保存配置</ElButton><ElButton @click="load">重新加载</ElButton></ElFormItem>
</ElForm>
</template>
<ElTabs v-else v-model="tab">
<ElTabPane label="管理员" name="admins">
<div class="mb-4 flex flex-wrap gap-2"><ElInput v-model="keyword" placeholder="搜索账号" style="width:220px" clearable @keyup.enter="page=1;load()"/><ElSelect v-model="enabled" clearable placeholder="全部状态" style="width:140px"><ElOption label="启用" :value="1"/><ElOption label="禁用" :value="0"/></ElSelect><ElButton @click="page=1;load()">查询</ElButton><ElButton v-if="canSave" type="primary" @click="editUser()">新增管理员</ElButton></div>
<ElTable :data="admins" empty-text="暂无管理员"><ElTableColumn prop="username" label="账号"/><ElTableColumn label="状态"><template #default="{row}"><ElSwitch :model-value="row.enabled" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="禁用" inline-prompt aria-label="管理员启用状态" :disabled="!canSave" :loading="saving" :before-change="()=>toggleAdmin(row as Admin)"/></template></ElTableColumn><ElTableColumn label="角色"><template #default="{row}">{{row.roles.map((code:string)=>roles.find(r=>r.code===code)?.name||code).join('、')||'无'}}</template></ElTableColumn><ElTableColumn label="创建时间"><template #default="{row}">{{new Date(row.created*1000).toLocaleString()}}</template></ElTableColumn><ElTableColumn v-if="canSave" label="操作" width="240"><template #default="{row}"><ElButton link @click="editUser(row as Admin)">编辑 / 重置密码</ElButton><ElButton link :disabled="saving" @click="revoke(row as Admin)">撤销会话</ElButton></template></ElTableColumn></ElTable>
<ElPagination v-model:current-page="page" :page-size="20" :total="total" layout="total, prev, pager, next" class="mt-4" @current-change="load"/>
</ElTabPane>
<ElTabPane label="角色权限" name="roles"><ElButton v-if="canSave" type="primary" class="mb-4" @click="editRole()">新增角色</ElButton><ElTable :data="roles" empty-text="暂无角色"><ElTableColumn prop="name" label="角色"/><ElTableColumn prop="code" label="代码"/><ElTableColumn label="权限数量"><template #default="{row}">{{row.permissions.length}}</template></ElTableColumn><ElTableColumn label="操作"><template #default="{row}"><ElButton v-if="canSave" link :disabled="row.code==='superadmin'" @click="editRole(row as Role)">{{row.code==='superadmin'?'内置角色':'编辑权限'}}</ElButton></template></ElTableColumn></ElTable></ElTabPane>
</ElTabs>
</ElCard>
<ElDialog v-model="userDialog" :title="editingId?'编辑管理员':'新增管理员'" width="560px" @closed="userForm.password=''">
<ElForm label-width="100px"><ElFormItem label="账号"><ElInput v-model="userForm.username" maxlength="64" autocomplete="off"/></ElFormItem><ElFormItem :label="editingId?'新密码':'密码'"><ElInput v-model="userForm.password" type="password" show-password autocomplete="new-password" :placeholder="editingId?'留空不修改；至少12位':'至少12位'"/></ElFormItem><ElFormItem label="启用"><ElSwitch v-model="userForm.enabled" :active-value="1" :inactive-value="0"/></ElFormItem><ElFormItem label="角色"><ElSelect v-model="userForm.roles" multiple style="width:100%"><ElOption v-for="role in roles" :key="role.code" :label="role.name" :value="role.code"/></ElSelect></ElFormItem></ElForm><template #footer><ElButton @click="userDialog=false">取消</ElButton><ElButton type="primary" :loading="saving" @click="saveUser">保存</ElButton></template></ElDialog>
<ElDialog v-model="roleDialog" title="角色与权限" width="620px"><ElForm label-width="100px"><ElFormItem label="角色代码"><ElInput v-model="roleForm.code" :disabled="editingRole" placeholder="3至64位小写英文、数字、下划线"/></ElFormItem><ElFormItem label="中文名称"><ElInput v-model="roleForm.name" maxlength="100"/></ElFormItem><ElFormItem label="权限"><ElSelect v-model="roleForm.permissions" multiple filterable style="width:100%"><ElOption v-for="permission in permissions" :key="permission.code" :label="permission.name" :value="permission.code"/></ElSelect></ElFormItem></ElForm><template #footer><ElButton @click="roleDialog=false">取消</ElButton><ElButton type="primary" :loading="saving" @click="saveRole">保存</ElButton></template></ElDialog>
</Page>
</template>
