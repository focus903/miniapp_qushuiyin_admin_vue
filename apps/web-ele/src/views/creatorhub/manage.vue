<script setup lang="ts">
import { featureLabel } from '#/utils/feature-label';
import PackageOrder from './package-order.vue';
import EntrySwitch from './entry-switch.vue';
import PlanEntitlements from './plan-entitlements.vue';
import { adminActionLabel } from '#/utils/admin-action';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';
import { ElAlert, ElButton, ElCard, ElDialog, ElForm, ElFormItem, ElInput, ElInputNumber, ElMessage, ElSelect, ElOption, ElSwitch, ElTable, ElTableColumn, ElPagination, ElTag, ElTooltip } from 'element-plus';
import { requestClient } from '#/api/request';
type Row = Record<string, string | number>;
const route = useRoute(); const access = useAccessStore();
const resource = computed(() => String(route.meta.resource || 'feature-billing'));
const rows = ref<Row[]>([]); const busy = ref(false); const error = ref(''); const page = ref(1); const keyword = ref('');
const plans = ref<Row[]>([]); const features = ref<Row[]>([]); const enabledFilter = ref<number>();
const creating = ref(false); const editing = ref(false); const saving = ref(false); const keys = ref<Row>({}); const form = ref<Row>({});
const entitlementOpen=ref(false);const entitlementPlan=ref({code:'',name:''});
function openEntitlements(row:Row){entitlementPlan.value={code:String(row.code),name:String(row.name)};entitlementOpen.value=true;}
const packageOrderOpen=ref(false);
const detail = ref<Row>();
const switching = ref(new Set<string>());
const isSwitch = (key: string) => ['enabled', 'unlimited'].includes(key);
const fields: Record<string,string> = {weight:'权重',feature:'功能',name:'名称',unit:'计费单位',unit_size:'每单位用量',points:'积分',enabled:'启用状态',code:'英文标识',daily_limit:'每天最多领取次数',price_fen:'价格（元）',wx_product_id:'微信道具 ID',base_points:'基础积分',bonus_points:'赠送积分',days:'有效天数',plan_code:'会员套餐',unlimited:'不限次数',daily_count:'每日免费次数',single_seconds:'单次最长秒数',daily_seconds:'每日总秒数',admin_username:'操作管理员账号',admin_id:'管理员ID',action:'操作',target_label:'操作对象',target_description:'操作说明',target:'原始目标标识',detail:'操作详情',created:'时间'};
const schemas: Record<string,string[]> = {
 'feature-billing':['feature','name','unit','unit_size','points','weight','enabled'],
 'point-rewards':['code','points','daily_limit','weight','enabled'],
 'point-packages':['code','name','wx_product_id','price_fen','base_points','bonus_points','weight','enabled'],
 'membership-plans':['code','name','days','wx_product_id','price_fen','enabled'],
 'membership-entitlements':['plan_code','feature','unlimited','daily_count','single_seconds','daily_seconds','weight'],
 logs:['created','admin_username','action','target_label','target_description'],
};
const columns = computed(() => schemas[resource.value] || []);
const hints: Record<string,string> = {
 'feature-billing':'费用按用量向上取整。例如每 30 秒 30 积分，31 秒收取 60 积分。关闭计费表示免费，不代表关闭小程序功能。',
 'point-rewards':'权重越大越靠前，相同权重按英文标识排序。新人注册奖励首次注册发放一次（含开发登录），不受每日次数影响；关闭期间注册及老用户不补发。签到按北京时间自然日领取；每日次数为 0 时不能领取。激励广告需接入可信的广告验证服务后才可用。',
 'point-packages':'支持拖动排序，权重越大越靠前；相同权重按英文标识排序。基础积分与赠送积分合计发放。微信道具 ID 和价格须与微信对应环境的道具配置一致；道具 ID 留空禁止在线支付。',
 'membership-plans':'有效天数 0 表示永久有效，正数按 24 小时计算；禁用套餐后停止新开通，已有会员保留至到期。微信道具 ID 和价格须与微信对应环境的道具配置一致；道具 ID 留空禁止在线支付。',
 'membership-entitlements':'不限次数只放开次数限制，时长限制仍生效。每日免费次数 0 表示没有免费次数；时长 0 表示不限。',
 logs:'记录后台配置、权限和人工发放等操作；不记录密码和密钥。',
};
const canEdit = computed(() => access.accessCodes.includes(`${resource.value}:update`) && resource.value!=='logs');
const filtered = computed(() => rows.value.filter(row =>
 (enabledFilter.value===undefined || Number(row.enabled)===enabledFilter.value) &&
 (!keyword.value.trim() || columns.value.some(key=>String(display(row,key)).toLowerCase().includes(keyword.value.trim().toLowerCase())))
));
const visibleRows = computed(() => resource.value==='logs'?rows.value:filtered.value.slice((page.value-1)*20,page.value*20));
const secondsAllowed = computed(() => ['remove_subtitle','remove_watermark','extract_text_upload'].includes(String(keys.value.feature)));
const allowedUnits = computed(() => keys.value.feature==='tts'?['count','characters']:secondsAllowed.value?['count','seconds']:['count']);
const unitLabels: Record<string,string> = {count:'次',seconds:'秒',characters:'字符'};
function display(row:Row,key:string) {
 const value=row[key];
 if(key==='action')return adminActionLabel(value);
 if(key==='days' && Number(value)===0) return '永久有效';
 if(resource.value==='feature-billing'&&key==='unit_size') return value===null||value===undefined?'—':`${value} ${unitLabels[String(row.unit)]||row.unit||''}`;
 if(key==='unit') return unitLabels[String(value)] || value;
 if(key==='wx_product_id') return value || '未配置（禁止在线支付）';
 if(key==='price_fen') return (Number(value)/100).toFixed(2);
 if(key==='created') return value?new Date(Number(value)*1000).toLocaleString('zh-CN',{hour12:false}):'—';
 if(key==='code' && resource.value==='point-rewards') return value==='new_user'?'新人注册奖励':value==='signin'?'签到奖励':value==='ad'?'激励广告奖励':value;
 if(key==='feature') return featureLabel(value,row.name||features.value.find(item=>item.feature===value)?.name);
 if(key==='plan_code') return plans.value.find(item=>item.code===value)?.name || value;
 if(key==='daily_count' && row.unlimited===1) return '不限次数';
 if(['single_seconds','daily_seconds'].includes(key) && !['remove_subtitle','remove_watermark','extract_text_upload'].includes(String(row.feature)))return '不适用';
 if(['single_seconds','daily_seconds'].includes(key)) return Number(value)===0?'不限':`${value} 秒`;
 return value;
}
function rowKeys(row: Row): Row {
 const names = resource.value==='membership-entitlements'?['plan_code','feature']:resource.value==='feature-billing'?['feature']:['code'];
 return Object.fromEntries(names.map(key => [key, row[key]!]));
}
function switchKey(row:Row,key:string) {return JSON.stringify([resource.value,rowKeys(row),key]);}
async function toggle(row:Row,key:string):Promise<boolean> {
 const id=switchKey(row,key);if(switching.value.has(id))return false;
 switching.value.add(id);const value=Number(row[key])===1?0:1;
 try {await requestClient.put(`/configs/${resource.value}`,{keys:rowKeys(row),values:{[key]:value}});row[key]=value;ElMessage.success('配置已保存');return true;}
 catch {return false;}finally {switching.value.delete(id);}
}
const logTotal=ref(0);
let loadVersion=0;
async function load() {
 const version=++loadVersion;const current=resource.value;busy.value=true;error.value='';
 try {
  const result=await requestClient.get<Row[]|{items:Row[];total:number}>(current==='logs'?'/logs':`/configs/${current}`,{params:{page:page.value,paginated:current==='logs'?true:undefined,keyword:current==='logs'?keyword.value:undefined}});
  if(version!==loadVersion)return;rows.value=Array.isArray(result)?result:result.items;logTotal.value=Array.isArray(result)?0:result.total;
  if(current==='membership-entitlements'&&canEdit.value) {
   const options=await Promise.all([requestClient.get<Row[]>('/configs/options/membership-plans'),requestClient.get<Row[]>('/configs/options/feature-billing')]);
   if(version===loadVersion){plans.value=options[0];features.value=options[1];}
  }
 }catch(e){if(version===loadVersion)error.value=e instanceof Error?e.message:'加载失败，请重试';}
 finally{if(version===loadVersion)busy.value=false;}
}
function edit(row:Row) {
 creating.value=false;keys.value=rowKeys(row);
 form.value=Object.fromEntries(Object.entries(row).filter(([key])=>!Object.keys(keys.value).includes(key) && columns.value.includes(key)));
 editing.value=true;
}
function add() {
 creating.value=true;keys.value=resource.value==='membership-entitlements'?{plan_code:'',feature:''}:{code:''};
 form.value=resource.value==='point-packages'?{name:'',wx_product_id:'',price_fen:0,base_points:0,bonus_points:0,enabled:0,weight:0}:resource.value==='membership-plans'?{name:'',wx_product_id:'',days:30,price_fen:0,enabled:0}:{unlimited:0,daily_count:0,single_seconds:0,daily_seconds:0,weight:0};editing.value=true;
}
async function save() {
 if(creating.value && Object.values(keys.value).some(v=>!String(v).trim())){ElMessage.warning('请填写或选择完整标识');return;}
 saving.value=true;
 try{await requestClient[creating.value?'post':'put'](`/configs/${resource.value}`,{keys:keys.value,values:form.value});editing.value=false;ElMessage.success('配置已保存');await load();}finally{saving.value=false;}
}
watch(()=>keys.value.feature,()=>{if(!secondsAllowed.value && resource.value==='membership-entitlements'){form.value.single_seconds=0;form.value.daily_seconds=0;}});
watch([keyword,enabledFilter],()=>{page.value=1;});
watch(resource,()=>{packageOrderOpen.value=false;entitlementOpen.value=false;page.value=1;keyword.value='';enabledFilter.value=undefined;rows.value=[];editing.value=false;detail.value=undefined;void load();},{immediate:true});
</script>
<template>
 <Page :title="String(route.meta.title)" description="CreatorHub 运营管理">
  <ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-4" />
  <ElAlert :title="hints[resource]" type="info" :closable="false" class="mb-4" />
  <ElCard>
   <div class="mb-4 flex flex-wrap gap-3">
    <ElInput v-model="keyword" :placeholder="resource==='logs'?'搜索操作、管理员或目标':'按名称或标识筛选'" clearable style="width:260px" />
    <ElSelect v-if="columns.includes('enabled')" v-model="enabledFilter" placeholder="全部启用状态" clearable style="width:160px"><ElOption label="启用" :value="1"/><ElOption label="禁用" :value="0"/></ElSelect>
    <ElButton :loading="busy" @click="load">刷新</ElButton>
    <ElButton v-if="['point-packages','membership-plans'].includes(resource)&&canEdit" @click="packageOrderOpen=true">拖动排序</ElButton>
    <ElButton v-if="canEdit && ['point-packages','membership-plans','membership-entitlements'].includes(resource)" type="primary" @click="add">新增</ElButton>
    <EntrySwitch v-if="resource==='point-packages'" field="showDoCharge" label="显示积分充值入口" />
    <EntrySwitch v-if="resource==='membership-plans'" field="showVipCenter" label="显示会员开通入口" />
   </div>
   <ElTable v-loading="busy" :data="visibleRows" stripe border empty-text="暂无符合条件的记录">
    <ElTableColumn v-for="key in columns" :key="key" :prop="key" :label="fields[key] || key" :min-width="key==='admin_id'?260:140" show-overflow-tooltip>
     <template #default="scope">
      <ElSwitch v-if="isSwitch(key)" :model-value="Number(scope.row[key])" :active-value="1" :inactive-value="0" :active-text="key==='unlimited'?'不限':'启用'" :inactive-text="key==='unlimited'?'有限':'禁用'" inline-prompt :aria-label="fields[key]" :disabled="!canEdit" :loading="switching.has(switchKey(scope.row,key))" :before-change="()=>toggle(scope.row,key)"/>
      <ElTag v-else-if="resource==='feature-billing'&&['unit','unit_size','points'].includes(key)" class="billing-highlight" :type="key==='points'?'success':key==='unit_size'?'warning':'primary'" effect="light">{{display(scope.row,key)}}</ElTag>
      <ElButton v-else-if="resource==='membership-entitlements'&&key==='plan_code'" link type="primary" @click="openEntitlements({code:scope.row.plan_code,name:String(display(scope.row,key))})">{{display(scope.row,key)}} ☷</ElButton><ElTag v-else-if="key==='unit'" type="info">{{display(scope.row,key)}}</ElTag>
      <ElTooltip v-else-if="resource==='membership-plans'&&key==='name'&&access.accessCodes.includes('membership-entitlements:read')" content="查看次数与时长权益" placement="right"><ElButton type="primary" plain @click="openEntitlements(scope.row)"><span class="font-semibold">{{scope.row.name}}</span><span class="ml-2 text-xs opacity-30" aria-hidden="true">☷</span></ElButton></ElTooltip><span v-else>{{display(scope.row,key)}}</span>
     </template>
    </ElTableColumn>
    <ElTableColumn v-if="canEdit || resource==='logs'" label="操作" fixed="right" width="100"><template #default="scope"><ElButton v-if="canEdit" link type="primary" @click="edit(scope.row)">编辑</ElButton><ElButton v-else link type="primary" @click="detail=scope.row">详情</ElButton></template></ElTableColumn>
   </ElTable>
   <ElPagination v-if="resource!=='logs'" v-model:current-page="page" :page-size="20" :total="filtered.length" layout="total, prev, pager, next, jumper, slot" class="mt-4" style="justify-content:center;flex-wrap:wrap;row-gap:8px"><ElButton size="small" :disabled="page<=1" @click="page=1">首页</ElButton><ElButton size="small" :disabled="page>=Math.max(1,Math.ceil((filtered.length)/(20)))" @click="page=Math.max(1,Math.ceil((filtered.length)/(20)))">末页</ElButton></ElPagination>
   <ElPagination v-else v-model:current-page="page" :page-size="20" :total="logTotal" :disabled="busy" layout="total, prev, pager, next, jumper, slot" class="mt-4" @current-change="load" style="justify-content:center;flex-wrap:wrap;row-gap:8px"><ElButton size="small" :disabled="page<=1" @click="page=1;load()">首页</ElButton><ElButton size="small" :disabled="page>=Math.max(1,Math.ceil((logTotal)/(20)))" @click="page=Math.max(1,Math.ceil((logTotal)/(20)));load()">末页</ElButton></ElPagination>
  </ElCard>
  <PackageOrder :resource="resource==='membership-plans'?'membership-plans':'point-packages'" v-if="packageOrderOpen" v-model="packageOrderOpen" @saved="load"/>
  <PlanEntitlements v-if="entitlementOpen" v-model="entitlementOpen" :plan="entitlementPlan"/>
  <ElDialog v-model="editing" :title="creating?'新增配置':'编辑配置'" width="min(580px,95vw)" :close-on-click-modal="false">
   <ElForm label-position="top">
    <ElFormItem v-for="(value,key) in keys" :key="key" :label="fields[key] || key">
     <ElSelect v-if="key==='plan_code'" :model-value="String(value)" :disabled="!creating" filterable placeholder="选择会员套餐" @update:model-value="v=>keys[key]=v"><ElOption v-for="plan in plans" :key="plan.code" :value="String(plan.code)" :label="`${plan.name} (${plan.code})`"/></ElSelect>
     <ElSelect v-else-if="key==='feature'" :model-value="String(value)" :disabled="!creating" filterable placeholder="选择功能" @update:model-value="v=>keys[key]=v"><ElOption v-for="feature in features" :key="feature.feature" :value="String(feature.feature)" :label="featureLabel(feature.feature,feature.name)"/></ElSelect>
     <ElInput v-else :model-value="String(value)" :disabled="!creating" placeholder="小写英文、数字、横线或下划线" maxlength="32" @update:model-value="v=>keys[key]=v"/>
    </ElFormItem>
    <ElFormItem v-for="(value,key) in form" :key="key" :label="fields[key] || key">
     <ElSwitch v-if="isSwitch(key)" :model-value="Number(value)" :active-value="1" :inactive-value="0" :active-text="key==='unlimited'?'不限次数':'启用'" :inactive-text="key==='unlimited'?'有限次数':'禁用'" :aria-label="fields[key]" @update:model-value="v=>form[key]=Number(v)"/>
     <ElInputNumber v-else-if="key==='price_fen'" :model-value="Number(value)/100" :min="0" :max="10000000" :precision="2" @update:model-value="v=>form[key]=Math.round((v||0)*100)"/>
     <ElInput v-else-if="key==='wx_product_id'" :model-value="String(value)" maxlength="128" placeholder="微信对应环境道具 ID，留空禁止在线支付" @update:model-value="v=>form[key]=v"/>
     <ElInputNumber v-else-if="typeof value==='number'" :model-value="Number(value)" :min="key==='unit_size'?1:0" :max="1000000000" :precision="0" :disabled="(key==='daily_count' && Number(form.unlimited)===1) || (['single_seconds','daily_seconds'].includes(key) && !secondsAllowed)" @update:model-value="v=>form[key]=v||0"/>
     <ElSelect v-else-if="key==='unit'" :model-value="String(value)" @update:model-value="v=>form[key]=v"><ElOption v-for="unit in allowedUnits" :key="unit" :label="unitLabels[unit]" :value="unit"/></ElSelect>
     <ElInput v-else :model-value="String(value)" maxlength="100" @update:model-value="v=>form[key]=v"/>
     <div v-if="key==='daily_count'" class="w-full text-xs text-gray-500">有限次数时，0 表示没有免费次数；打开“不限次数”后不使用此值。</div>
     <div v-if="key==='wx_product_id'" class="w-full text-xs text-gray-500">道具 ID 与价格须和微信对应环境配置一致；留空禁止在线支付。此字段与英文标识独立，不修改原套餐标识。</div>
     <div v-if="key==='price_fen'" class="w-full text-xs text-gray-500">输入单位为元，保存为整数分：1.99 元保存为 199 分，支付不再换算。</div>
     <div v-if="['single_seconds','daily_seconds'].includes(key)" class="w-full text-xs text-gray-500">0 表示不限时长，上传视频去水印、去字幕和文案提取支持时长权益。</div>
    </ElFormItem>
   </ElForm>
   <template #footer><ElButton :disabled="saving" @click="editing=false">取消</ElButton><ElButton type="primary" :loading="saving" @click="save">保存</ElButton></template>
  </ElDialog>
  <ElDialog :model-value="!!detail" title="操作详情" width="min(720px,95vw)" @close="detail=undefined"><div class="mb-3">操作对象：{{detail?.target_label}}</div><div class="mb-3">操作说明：{{detail?.target_description||'—'}}</div><div class="mb-3 break-all">原始目标标识：{{detail?.target||'—'}}</div><pre class="whitespace-pre-wrap break-all">{{detail?.detail}}</pre></ElDialog>
 </Page>
</template>

<style scoped>
.billing-highlight { font-size:14px; font-weight:700; font-variant-numeric:tabular-nums; }
</style>
