<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';
import { ElAlert,ElButton,ElCard,ElDatePicker,ElDescriptions,ElDescriptionsItem,ElDialog,ElForm,ElFormItem,ElInput,ElInputNumber,ElMessage,ElMessageBox,ElOption,ElPagination,ElSelect,ElTable,ElTableColumn,ElTag } from 'element-plus';
import { requestClient } from '#/api/request';
type Row=Record<string,unknown>;
type Result={items:Row[];total:number};
const route=useRoute();const access=useAccessStore();
const resource=computed(()=>String(route.meta.resource||'dashboard'));
const kind=ref('');const page=ref(1);const size=ref(20);const rows=ref<Row[]>([]);const total=ref(0);const busy=ref(false);const error=ref('');const dates=ref<[Date,Date]|null>(null);
const filters=ref({openid:'',status:'',platform:'',output_mode:'',run_id:'',resource_key:'',feature:'',is_valid:''});
const overview=ref<Row>({});const detail=ref<Row>({});const visible=ref(false);const detailName=ref('');const selectedUser=ref('');const tab=ref('');const history=ref<Row[]>([]);const historyTotal=ref(0);const historyPage=ref(1);const historyBusy=ref(false);
const labels:Record<string,string>={source_url:'来源（已移除查询凭据）',association_note:'关联说明',object_key:'文件路径',content_md5:'内容 MD5',id:'记录编号',openid:'用户 OpenId',development:'开发账号',status:'状态',scene:'场景',platform:'平台',title:'标题',error_code:'错误码',created:'创建时间',finished:'完成时间',updated:'更新时间',resource_key:'资源标识',output_mode:'模式',run_id:'批次',is_valid:'有效状态',upload_status:'上传状态',media_type:'媒体类型',position:'顺序',storage_type:'存储类型',storage_ref:'存储引用',bucket_code:'存储桶',file_size:'文件大小（字节）',fallback_reason:'回退原因',cleanup_pending:'待清理',progress:'进度（%）',error:'错误原因',detected_frames:'修复帧数',duration:'时长（秒）',size:'文件大小（字节）',width:'视频宽度',height:'视频高度',x:'区域 X',y:'区域 Y',w:'区域宽',h:'区域高',started:'开始时间',expires:'到期时间',cancelled:'已取消',feature:'功能',day:'日期',points:'积分变动',duration_ms:'用量（毫秒）',business_id:'业务编号',plan_code:'会员套餐',starts:'生效时间',balance:'积分余额',reserved:'冻结积分',used_count:'已用次数',reserved_count:'冻结次数',used_ms:'已用时长（毫秒）',reserved_ms:'冻结时长（毫秒）',order_type:'订单类型',amount_fen:'金额（分）',paid_at:'支付时间',admin_id:'管理员编号',action:'操作',target:'操作目标',users:'累计用户数',parses:'解析次数',consumed_points:'实际消耗积分',subtitle_completed:'去字幕已结束任务',subtitle_success_rate:'去字幕成功率（%）',watermark_completed:'去水印已结束任务',watermark_success_rate:'去水印成功率（%）'};
const columnMap:Record<string,string[]>={users:['openid','development','balance','reserved'],parses:['openid','platform','scene','status','title','created'],resources:['resource_key','platform','output_mode','status','run_id','updated'],files:['resource_key','media_type','is_valid','upload_status','output_mode','run_id','file_size'],subtitle:['openid','status','progress','duration','error','created'],watermark:['openid','status','progress','duration','error','created'],points:['openid','feature','points','status','created'],memberships:['openid','plan_code','starts','expires'],orders:['openid','order_type','status','amount_fen','points','created'],usage:['feature','day','used_count','reserved_count','used_ms'],logs:['admin_id','action','target','created']};
const columns=computed(()=>columnMap[kind.value]||[]);
const task=computed(()=>['subtitle','watermark'].includes(kind.value));
const choices=computed(()=>resource.value==='parses'?[['parses','用户解析记录'],['resources','共享资源'],['files','关联文件']]:resource.value==='tasks'?[['subtitle','视频去字幕'],['watermark','视频去水印']]:[[resource.value,String(route.meta.title)]]);
const statusOptions=computed(()=>task.value?[['0','处理中'],['1','成功'],['2','失败/取消'],['3','过期']]:kind.value==='points'?[['reserved','冻结'],['committed','已入账'],['released','已释放']]:kind.value==='resources'?[['ready','可用'],['failed','失败'],['processing','处理中']]:kind.value==='orders'?[['pending','待支付'],['paid','已支付'],['manual','人工发放']]:[['success','成功'],['failed','失败'],['processing','处理中']]);
function show(key:string,value:unknown,row:Row={}):string {
 if(value===null||value===undefined)return '—';
 if(['created','updated','started','finished','starts','expires','paid_at'].includes(key))return Number(value)?new Date(Number(value)*1000).toLocaleString('zh-CN'):'—';
 if(key==='status'){if(row.cancelled)return '已取消';return ({'0':'处理中','1':'成功','2':'失败','3':'过期',committed:Number(row.points)<0?'入账/退回':'消费结算',reserved:'冻结',released:'释放',success:'成功',failed:'失败',processing:'处理中',pending:'待处理/支付',paid:'已支付',manual:'人工发放',ready:'可用'} as Record<string,string>)[String(value)]||String(value);}
 if(['development','is_valid','cleanup_pending','cancelled'].includes(key))return value===true||Number(value)===1?'是':'否';
 if(key==='output_mode')return ({direct:'直连',cache:'缓存'} as Record<string,string>)[String(value)]||String(value);
 if(key==='upload_status')return ({success:'成功',failed:'失败',pending:'待上传',uploaded:'已上传',local:'本地存储'} as Record<string,string>)[String(value)]||String(value);
 if(key==='feature')return ({admin_deduct:'人工扣除',parse_share:'链接去水印',remove_subtitle:'视频去字幕',remove_watermark:'视频区域去水印',tts:'配音',extract_text:'文案提取',image_repair:'图片去水印',image_large:'图片高清'} as Record<string,string>)[String(value)]||String(value)||'积分发放';
 if(key==='order_type')return ({points:'积分充值',membership:'会员开通'} as Record<string,string>)[String(value)]||String(value);
 if(key==='points')return `${Number(value)>0?'-':Number(value)<0?'+':''}${Math.abs(Number(value))}`;
 return String(value);
}
async function load(){busy.value=true;error.value='';try{const params={...Object.fromEntries(Object.entries(filters.value).filter(([,v])=>v!=='')),page:page.value,page_size:size.value,start:dates.value?Math.floor(dates.value[0].getTime()/1000):0,end:dates.value?Math.floor(dates.value[1].getTime()/1000):0};if(kind.value==='dashboard')overview.value=await requestClient.get('/operations/dashboard',{params});else{const data=await requestClient.get<Result>(`/operations/records/${kind.value}`,{params});rows.value=data.items;total.value=data.total;}}catch(e){error.value=e instanceof Error?e.message:'加载失败，请重试';}finally{busy.value=false;}}
function search(){page.value=1;void load();}
async function open(row:Row){try{detailName.value=kind.value;selectedUser.value=kind.value==='users'?String(row.openid):'';detail.value=await requestClient.get(kind.value==='users'?`/operations/users/${encodeURIComponent(String(row.openid))}`:`/operations/records/${kind.value}/${encodeURIComponent(String(row.id||row.resource_key))}`);tab.value='';history.value=[];visible.value=true;}catch(e){ElMessage.error(e instanceof Error?e.message:'详情加载失败');}}
const userTabs=computed(()=>[['usage','使用记录','users:read'],['parses','解析记录','operations:read'],['points','积分流水','points:read'],['memberships','会员记录','membership:read'],['logs','管理员操作','users:read']].filter(v=>access.accessCodes.includes(v[2]!)));
async function historyLoad(){historyBusy.value=true;try{const url=tab.value==='logs'?`/operations/users/${encodeURIComponent(selectedUser.value)}/logs`:`/operations/records/${tab.value}`;const data=await requestClient.get<Result>(url,{params:{openid:selectedUser.value,page:historyPage.value,page_size:20}});history.value=data.items;historyTotal.value=data.total;}catch(e){ElMessage.error(e instanceof Error?e.message:'加载失败');}finally{historyBusy.value=false;}}
async function operate(row:Row,action:'retry'|'cancel'){let max_points=0;try{if(action==='retry'){const q=await requestClient.get<{points:number;availablePoints:number;memberCovered:boolean}>(`/operations/tasks/${kind.value}/${row.id}/quote`);max_points=q.points;await ElMessageBox.confirm(`本次预计扣除 ${q.points} 积分，可用 ${q.availablePoints} 积分${q.memberCovered?'，会员权益覆盖':''}。确认重新排队？`,'重试费用确认',{type:'warning'});}else await ElMessageBox.confirm('取消将协作停止任务并释放冻结额度，保留记录和原视频。确认取消？','取消任务',{type:'warning'});const {value}=await ElMessageBox.prompt('请输入操作原因','操作原因',{inputValidator:v=>!!v?.trim()||'请填写原因'});busy.value=true;await requestClient.post(`/operations/tasks/${kind.value}/${row.id}/${action}`,{max_points,reason:value});ElMessage.success('操作成功');await load();}catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(e instanceof Error?e.message:'操作未完成，请刷新核对');}finally{busy.value=false;}}
const granting=ref(false);const grantType=ref('points');const plans=ref<Row[]>([]);const saving=ref(false);const grant=ref({openid:'',points:0,plan:'',reason:'',business_id:''});
async function openGrant(row:Row){grant.value={openid:String(row.openid),points:0,plan:'',reason:'',business_id:crypto.randomUUID()};grantType.value=access.accessCodes.includes('points:grant')?'points':'membership';if(access.accessCodes.includes('membership:grant')){try{plans.value=await requestClient.get('/operations/membership-plans');}catch{ElMessage.error('套餐加载失败');return;}}granting.value=true;}
async function grantSave(){if(!grant.value.reason.trim()){ElMessage.warning('请输入原因');return;}saving.value=true;try{await requestClient.post(grantType.value==='points'?'/points/grant':'/memberships/grant',grant.value);granting.value=false;ElMessage.success('发放成功');await load();}finally{saving.value=false;}}
const deducting=ref(false);const deductSaving=ref(false);const availablePoints=ref(0);
const deduction=ref({openid:'',points:1,reason:'',business_id:''});
async function openDeduct(row:Row){
 try{
  const data=await requestClient.get<{account:{balance:number;reserved:number}}>(`/operations/users/${encodeURIComponent(String(row.openid))}`);
  availablePoints.value=Number(data.account?.balance||0)-Number(data.account?.reserved||0);
  deduction.value={openid:String(row.openid),points:1,reason:'',business_id:crypto.randomUUID()};
  deducting.value=true;
 }catch(e){ElMessage.error(e instanceof Error?e.message:'余额加载失败');}
}
async function deductSave(){
 if(deductSaving.value)return;
 if(!Number.isInteger(deduction.value.points)||deduction.value.points<=0){ElMessage.warning('请输入正整数积分');return;}
 if(deduction.value.points>availablePoints.value){ElMessage.warning('可用积分不足');return;}
 if(!deduction.value.reason.trim()){ElMessage.warning('请输入扣除原因');return;}
 deductSaving.value=true;
 try{
  const result=await requestClient.post<{applied:boolean}>('/points/deduct',{...deduction.value,reason:deduction.value.reason.trim()});
  deducting.value=false;ElMessage.success(result.applied?'扣除成功':'该笔扣除已处理，未重复扣款');await load();
 }catch(e){ElMessage.error(e instanceof Error?e.message:'扣除未完成，请核对后重试');}
 finally{deductSaving.value=false;}
}
watch(resource,()=>{kind.value=resource.value==='tasks'?'subtitle':resource.value==='parses'?'parses':resource.value;},{immediate:true});
watch(kind,()=>{page.value=1;rows.value=[];filters.value={openid:'',status:'',platform:'',output_mode:'',run_id:'',resource_key:'',feature:'',is_valid:''};void load();},{immediate:true});
</script>
<template>
<Page :title="String(route.meta.title)" description="运营记录与任务管理">
<ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-4" />
<div class="mb-4 flex flex-wrap gap-3">
<ElSelect v-if="choices.length>1" v-model="kind" style="width:180px"><ElOption v-for="c in choices" :key="c[0]" :value="c[0]!" :label="c[1]" /></ElSelect>
<ElInput v-if="!['dashboard','resources','files'].includes(kind)" v-model="filters.openid" placeholder="完整 OpenId" clearable style="width:240px" @keyup.enter="search" />
<ElSelect v-if="['subtitle','watermark','points','orders','parses','resources'].includes(kind)" v-model="filters.status" clearable placeholder="全部状态" style="width:150px"><ElOption v-for="s in statusOptions" :key="s[0]" :value="s[0]!" :label="s[1]" /></ElSelect>
<ElInput v-if="['parses','resources'].includes(kind)" v-model="filters.platform" placeholder="平台" clearable style="width:130px" />
<template v-if="['resources','files'].includes(kind)"><ElInput v-model="filters.resource_key" placeholder="资源标识" clearable style="width:220px" /><ElInput v-model="filters.run_id" placeholder="批次" clearable style="width:170px" /><ElInput v-model="filters.output_mode" placeholder="模式" clearable style="width:120px" /></template>
<ElSelect v-if="kind==='files'" v-model="filters.is_valid" clearable placeholder="有效状态" style="width:130px"><ElOption label="有效" value="1" /><ElOption label="失效" value="0" /></ElSelect>
<ElDatePicker v-if="kind!=='users'" v-model="dates" type="datetimerange" start-placeholder="开始时间" end-placeholder="结束时间" />
<ElButton :loading="busy" type="primary" @click="search">查询</ElButton>
</div>
<template v-if="kind==='dashboard'"><ElAlert title="用户数为累计；其余指标按创建时间筛选。成功率仅统计成功和失败任务，排除取消、处理中及已过期任务。积分统计已结算的实际消费。" type="info" :closable="false" class="mb-4" /><div class="grid gap-4 md:grid-cols-4"><ElCard v-for="(value,key) in overview" :key="key"><div>{{labels[key]}}</div><div class="mt-4 text-3xl">{{value??'暂无数据'}}</div></ElCard></div></template>
<ElCard v-else><ElTable v-loading="busy" :data="rows" stripe border empty-text="暂无记录"><ElTableColumn v-for="key in columns" :key="key" :label="labels[key]" :min-width="key==='openid'||key==='error'?220:150" show-overflow-tooltip><template #default="s"><ElTag v-if="key==='status'||key==='is_valid'">{{show(key,s.row[key],s.row)}}</ElTag><span v-else>{{show(key,s.row[key],s.row)}}</span></template></ElTableColumn><ElTableColumn label="操作" fixed="right" :width="task||kind==='users'?260:180"><template #default="s"><ElButton link type="primary" @click="open(s.row)">详情</ElButton><template v-if="task&&access.accessCodes.includes('tasks:operate')"><ElButton link :disabled="busy||Number(s.row.status)!==2" @click="operate(s.row,'retry')">重试</ElButton><ElButton link type="danger" :disabled="busy||Number(s.row.status)!==0" @click="operate(s.row,'cancel')">取消</ElButton></template><ElButton v-if="kind==='users'&&(access.accessCodes.includes('points:grant')||access.accessCodes.includes('membership:grant'))" link @click="openGrant(s.row)">人工发放</ElButton><ElButton v-if="kind==='users'&&access.accessCodes.includes('points:grant')" link type="danger" @click="openDeduct(s.row)">扣除积分</ElButton></template></ElTableColumn></ElTable><ElPagination v-model:current-page="page" v-model:page-size="size" class="mt-4" :total="total" :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @current-change="load" @size-change="search" /></ElCard>
<ElDialog v-model="visible" title="记录详情" width="85%"><ElDescriptions :column="2" border><ElDescriptionsItem v-for="(value,key) in detail" v-show="!['account','membership','related_resources'].includes(String(key))" :key="key" :label="labels[key]||String(key)">{{show(String(key),value,detail)}}</ElDescriptionsItem></ElDescriptions>
<ElTable v-if="detailName==='parses'" :data="(detail.related_resources as Row[])||[]" class="mt-4" empty-text="未找到相同来源的共享资源"><ElTableColumn v-for="key in columnMap.resources" :key="key" :label="labels[key]" min-width="140"><template #default="s">{{show(key,s.row[key],s.row)}}</template></ElTableColumn><ElTableColumn label="操作"><template #default="s"><ElButton link @click="visible=false;kind='files';$nextTick(()=>{filters.resource_key=String(s.row.resource_key);search();})">关联文件</ElButton></template></ElTableColumn></ElTable><ElButton v-if="detailName==='resources'" class="mt-4" @click="visible=false;kind='files';$nextTick(()=>{filters.resource_key=String(detail.resource_key);search();})">查看关联文件</ElButton><template v-if="selectedUser"><ElDescriptions class="mt-4" :column="2" border><ElDescriptionsItem label="积分余额">{{(detail.account as Row)?.balance}}</ElDescriptionsItem><ElDescriptionsItem label="冻结积分">{{(detail.account as Row)?.reserved}}</ElDescriptionsItem><ElDescriptionsItem label="有效会员">{{(detail.membership as Row)?.plan_code||'无'}}</ElDescriptionsItem><ElDescriptionsItem label="会员到期">{{show('expires',(detail.membership as Row)?.expires)}}</ElDescriptionsItem></ElDescriptions><div class="my-4 flex gap-2"><ElButton v-for="t in userTabs" :key="t[0]" :type="tab===t[0]?'primary':'default'" @click="tab=t[0]!;historyPage=1;historyLoad()">{{t[1]}}</ElButton></div><ElTable v-if="tab" v-loading="historyBusy" :data="history" border empty-text="暂无记录"><ElTableColumn v-for="key in columnMap[tab]" :key="key" :label="labels[key]" min-width="160"><template #default="s">{{show(key,s.row[key],s.row)}}</template></ElTableColumn></ElTable><ElPagination v-if="tab" v-model:current-page="historyPage" :total="historyTotal" :page-size="20" layout="total,prev,pager,next" @current-change="historyLoad" /></template></ElDialog>
<ElDialog v-model="granting" title="人工发放（不代表微信支付）" width="520px"><ElForm label-position="top"><ElFormItem label="用户"><ElInput v-model="grant.openid" disabled /></ElFormItem><ElFormItem label="操作"><ElSelect v-model="grantType"><ElOption v-if="access.accessCodes.includes('points:grant')" label="发放积分" value="points" /><ElOption v-if="access.accessCodes.includes('membership:grant')" label="开通会员" value="membership" /></ElSelect></ElFormItem><ElFormItem v-if="grantType==='points'" label="积分"><ElInputNumber v-model="grant.points" :min="0" :precision="0" /></ElFormItem><ElFormItem v-else label="会员套餐"><ElSelect v-model="grant.plan"><ElOption v-for="p in plans" :key="String(p.code)" :label="String(p.name)" :value="String(p.code)" /></ElSelect></ElFormItem><ElFormItem label="原因"><ElInput v-model="grant.reason" maxlength="200" /></ElFormItem></ElForm><template #footer><ElButton :loading="saving" type="primary" @click="grantSave">确认发放</ElButton></template></ElDialog>
<ElDialog v-model="deducting" title="扣除积分" width="520px" :close-on-click-modal="false" :close-on-press-escape="!deductSaving" :show-close="!deductSaving">
<ElForm label-position="top" :disabled="deductSaving"><ElFormItem label="用户"><ElInput :model-value="deduction.openid" disabled /></ElFormItem>
<ElAlert :title="`当前可用积分：${availablePoints}（不含冻结积分）`" type="warning" :closable="false" class="mb-4" />
<ElFormItem label="扣除积分"><ElInputNumber v-model="deduction.points" :min="1" :max="1000000000" :precision="0" /></ElFormItem>
<ElFormItem label="扣除原因（必填）"><ElInput v-model="deduction.reason" type="textarea" maxlength="200" show-word-limit /></ElFormItem></ElForm>
<template #footer><ElButton :disabled="deductSaving" @click="deducting=false">取消</ElButton><ElButton :loading="deductSaving" type="danger" @click="deductSave">确认扣除</ElButton></template>
</ElDialog>
</Page>
</template>
