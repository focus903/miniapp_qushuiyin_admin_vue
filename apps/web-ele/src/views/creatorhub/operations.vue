<script setup lang="ts">
import { featureLabel } from '#/utils/feature-label';
import { adminActionLabel } from '#/utils/admin-action';
import CopyValue from '#/components/copy-value.vue';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';
import { ElDropdown,ElDropdownMenu,ElDropdownItem,ElAvatar,ElAlert,ElButton,ElCard,ElDescriptions,ElDescriptionsItem,ElDialog,ElForm,ElFormItem,ElInput,ElInputNumber,ElMessage,ElMessageBox,ElOption,ElPagination,ElSelect,ElTable,ElTableColumn,ElTabs,ElTabPane,ElTag,ElTooltip } from 'element-plus';
import { requestClient } from '#/api/request';
import ParseDetail from './parse-detail.vue';
import MediaFilePreview from './media-file-preview.vue';
import AppDatePicker from '#/components/app-date-picker.vue';
type Row=Record<string,unknown>;
type Result={items:Row[];total:number};
const route=useRoute();const access=useAccessStore();
const resource=computed(()=>String(route.meta.resource||'dashboard'));
const kind=ref('');const page=ref(1);const size=ref(20);const rows=ref<Row[]>([]);const total=ref(0);const busy=ref(false);const error=ref('');const dates=ref<[Date,Date]|null>(null);
const filters=ref({openid:'',status:'',platform:'',output_mode:'',run_id:'',resource_key:'',feature:'',is_valid:''});
const overview=ref<Row>({});const detail=ref<Row>({});const visible=ref(false);const detailName=ref('');const selectedUser=ref('');const tab=ref('');const history=ref<Row[]>([]);const historyTotal=ref(0);const historyPage=ref(1);const historyBusy=ref(false);
// 详情只展示一份账户和会员信息，隐藏嵌套对象及重复的套餐编号。
const detailFields=computed(()=>{
 const value:Row={...detail.value};
 if(detailName.value==='users'){
  const account=detail.value.account as Row|undefined;
  const membership=detail.value.membership as Row|null|undefined;
  value.balance=account?.balance??value.balance;
  value.reserved=account?.reserved??value.reserved;
  value.plan_name=membership?(value.plan_name||membership.plan_code):'无';
  value.expires=membership?.expires??null;
  delete value.plan_code;
 }
 return Object.fromEntries(Object.entries(value).filter(([key])=>
  !['account','membership','related_resources'].includes(key)&&
  !(['parses','resources'].includes(detailName.value)&&['share_text','source_url','association_note'].includes(key))&&
  !(detailName.value==='points'&&key==='points')));
});
const resourceFilesOpen=ref(false), resourceFilesBusy=ref(false), resourceFilesError=ref(''), resourceFilesKey=ref('');
const resourceCaption=ref('');
const resourceFiles=ref<Row[]>([]), resourceFilesPage=ref(1), resourceFilesTotal=ref(0);
let resourceFilesVersion=0;
async function loadResourceFiles(){
 const version=++resourceFilesVersion;resourceFilesBusy.value=true;resourceFilesError.value='';resourceFiles.value=[];resourceCaption.value='';
 try{const [result,resourceDetail]=await Promise.all([requestClient.get<Result>('/operations/records/files',{params:{resource_key:resourceFilesKey.value,page:resourceFilesPage.value,page_size:20}}),requestClient.get<Row>(`/operations/records/resources/${encodeURIComponent(resourceFilesKey.value)}`)]);if(version===resourceFilesVersion){resourceFiles.value=result.items;resourceFilesTotal.value=result.total;resourceCaption.value=String(resourceDetail.title||'');}}
 catch(e){if(version===resourceFilesVersion)resourceFilesError.value=e instanceof Error?e.message:'关联文件加载失败';}
 finally{if(version===resourceFilesVersion)resourceFilesBusy.value=false;}
}
function openResourceFiles(row:Row){if(!canRead('files'))return;resourceFilesKey.value=String(row.resource_key);resourceFilesPage.value=1;resourceFilesTotal.value=0;resourceFilesOpen.value=true;void loadResourceFiles();}
watch(resourceFilesOpen,value=>{if(!value){resourceFilesVersion++;resourceFiles.value=[];resourceFilesBusy.value=false;}});
watch(kind,()=>{resourceFilesOpen.value=false;});
const pointsOpen=ref(false), pointsBusy=ref(false), pointsError=ref('');
const pointsOwner=ref(''), pointsBalance=ref<unknown>(null), pointsRows=ref<Row[]>([]), pointsPage=ref(1), pointsTotal=ref(0);
let pointsVersion=0;
async function loadUserPoints(){
 const version=++pointsVersion;pointsBusy.value=true;pointsError.value='';pointsRows.value=[];
 try{
  const [user,result]=await Promise.all([requestClient.get<Row>(`/operations/users/${encodeURIComponent(pointsOwner.value)}`),requestClient.get<Result>('/operations/records/points',{params:{openid:pointsOwner.value,page:pointsPage.value,page_size:20}})]);
  if(version===pointsVersion){pointsBalance.value=(user.account as Row)?.balance??null;pointsRows.value=result.items;pointsTotal.value=result.total;}
 }catch(e){if(version===pointsVersion)pointsError.value=e instanceof Error?e.message:'积分流水加载失败';}
 finally{if(version===pointsVersion)pointsBusy.value=false;}
}
function openUserPoints(row:Row){
 if(!access.accessCodes.includes('points:read'))return;
 pointsOwner.value=String(row.openid);pointsBalance.value=null;pointsPage.value=1;pointsTotal.value=0;pointsOpen.value=true;void loadUserPoints();
}
watch(pointsOpen,value=>{if(!value){pointsVersion++;pointsRows.value=[];pointsBusy.value=false;}});
watch(kind,()=>{pointsOpen.value=false;});
const labels:Record<string,string>={is_vip:'会员状态',plan_name:'会员套餐',share_parse_count:'分享链接解析次数',source_label:'积分来源',source_url:'完整分享链接',object_url:'文件地址',association_note:'关联说明',object_key:'文件路径',content_md5:'内容 MD5',id:'记录编号',openid:'用户 OpenId',development:'开发账号',status:'状态',deleted_at:'删除时间',deleted_by:'删除管理员ID',scene:'场景',platform:'平台',title:'标题',share_text:'原始分享内容',error_code:'错误码',created:'创建时间',finished:'完成时间',updated:'更新时间',resource_key:'资源标识',output_mode:'模式',run_id:'批次',is_valid:'有效状态',upload_status:'上传状态',media_type:'媒体类型',position:'顺序',storage_type:'存储类型',storage_ref:'存储引用',bucket_code:'存储桶',file_size:'文件大小',fallback_reason:'回退原因',cleanup_pending:'待清理',progress:'进度（%）',error:'错误原因',detected_frames:'修复帧数',duration:'时长（秒）',size:'文件大小',width:'视频宽度',height:'视频高度',x:'区域 X',y:'区域 Y',w:'区域宽',h:'区域高',started:'开始时间',expires:'到期时间',cancelled:'已取消',feature:'功能',day:'日期',balance_before:'变动前积分',point_change:'变动积分',balance_after:'积分余额',points:'积分变动',duration_ms:'用量（毫秒）',business_id:'业务编号',plan_code:'会员套餐',starts:'生效时间',balance:'积分余额',reserved:'冻结积分',used_count:'已用次数',reserved_count:'冻结次数',used_ms:'已用时长（毫秒）',reserved_ms:'冻结时长（毫秒）',order_type:'订单类型',amount_fen:'金额（分）',paid_at:'支付时间',admin_username:'操作管理员账号',admin_id:'管理员编号',action:'操作',target:'操作目标',users:'累计用户数',parses:'解析次数',consumed_points:'实际消耗积分',subtitle_completed:'去字幕已结束任务',subtitle_success_rate:'去字幕成功率（%）',watermark_completed:'去水印已结束任务',watermark_success_rate:'去水印成功率（%）'};
const columnMap:Record<string,string[]>={users:['openid','is_vip','plan_name','expires','share_parse_count','development','balance','reserved'],parses:['openid','platform','scene','status','share_text','created'],resources:['resource_key','share_text','source_url','platform','output_mode','status','run_id','updated'],files:['resource_key','media_type','is_valid','upload_status','output_mode','run_id','file_size'],subtitle:['openid','status','progress','duration','error','created'],watermark:['openid','status','progress','duration','error','created'],points:['openid','source_label','balance_before','point_change','balance_after','status','created'],memberships:['openid','plan_code','starts','expires'],orders:['openid','order_type','status','amount_fen','points','created'],usage:['feature','day','used_count','reserved_count','used_ms'],logs:['admin_username','action','target','created']};
const trashed=ref(false);const selected=ref<Row[]>([]);const recycleSaving=ref(false);
const columns=computed(()=>kind.value==='parses'&&trashed.value?[...(columnMap.parses||[]),'deleted_at','deleted_by']:columnMap[kind.value]||[]);
const task=computed(()=>['subtitle','watermark'].includes(kind.value));
const choices=computed(()=>[[resource.value,String(route.meta.title)]]);
const canRecycle=computed(()=>access.accessCodes.includes(trashed.value?'parses:restore':'parses:delete'));
const canRead=(name:string)=>access.accessCodes.includes(`${name==='memberships'?'membership':name}:read`);
const statusOptions=computed(()=>task.value?[['0','处理中'],['1','成功'],['2','失败/取消'],['3','过期']]:kind.value==='points'?[['reserved','冻结'],['committed','已入账'],['released','已释放']]:kind.value==='resources'?[['ready','可用'],['failed','失败'],['processing','处理中']]:kind.value==='orders'?[['pending','待支付'],['paid','已支付'],['manual','人工发放']]:[['success','成功'],['failed','失败'],['processing','处理中']]);
function modeHelp(value:unknown){return value==='cache'?'缓存：下载并持久保存视频、图片，优先存入已启用且可用的云存储；不可用时保存在服务器本地，后续复用已保存的文件。':value==='direct'?'直连：保存平台原始媒体地址，不下载持久保存；视频通过服务器流式转发播放，图片使用源地址。链接可能过期或受平台访问限制。':'未知模式';}
function sourceClass(row:Row){
 if(typeof row.source_label!=='string'||!row.source_label)return undefined;
 const feature=String(row.feature||'');
 const tone=['new_user','signin','ad'].includes(feature)?'reward':['admin_grant','admin_package'].includes(feature)?'manual':feature==='admin_deduct'?'deduct':['parse_share','remove_subtitle','remove_watermark','tts','extract_text','image_repair','image_large'].includes(feature)?'usage':'unknown';
 return ['point-source',`point-source-${tone}`];
}
function changeClass(value:unknown){return ['point-change',Number(value)>0?'point-increase':Number(value)<0?'point-decrease':'point-neutral'];}
function show(key:string,value:unknown,row:Row={}):string {
 if(key==='is_vip')return value?'会员':'普通用户';
 if(key==='action')return adminActionLabel(value);
 if(['file_size','size'].includes(key)){
  if(value===null||value===undefined||value==='')return '—';
  const bytes=Number(value);if(!Number.isFinite(bytes)||bytes<0)return '—';
  const units=['B','KB','MB','GB','TB'];
  const index=bytes>0?Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),units.length-1):0;
  const unit=Math.max(0,index);
  return `${Number((bytes/1024**unit).toFixed(unit===0?0:2))} ${units[unit]}`;
 }
 if(key==='expires' && row.plan_code && Number(value)===0 && value!==null)return '永久有效';
 if(key==='share_text'&&!value)return '未记录';
 if(value===null||value===undefined)return '—';
 if(['deleted_at','created','updated','started','finished','starts','expires','paid_at'].includes(key))return Number(value)?new Date(Number(value)*1000).toLocaleString('zh-CN'):'—';
 if(key==='status'){if(row.cancelled)return '已取消';if(value==='committed'&&row.feature==='admin_deduct')return '扣除成功';return ({'0':'处理中','1':'成功','2':'失败','3':'过期',committed:Number(row.points)<0?'入账/退回':'消费结算',reserved:'冻结',released:'释放',success:'成功',failed:'失败',processing:'处理中',pending:'待处理/支付',paid:'已支付',manual:'人工发放',ready:'可用'} as Record<string,string>)[String(value)]||String(value);}
 if(['development','is_valid','cleanup_pending','cancelled'].includes(key))return value===true||Number(value)===1?'是':'否';
 if(key==='scene')return ({parseShareLink:'视频／图集提取',extractTextFromLink:'视频文案提取'} as Record<string,string>)[String(value)]||String(value);
 if(key==='media_type')return ({image:'图片',video:'视频'} as Record<string,string>)[String(value)]||String(value);
 if(key==='output_mode')return ({direct:'直连',cache:'缓存'} as Record<string,string>)[String(value)]||String(value);
 if(key==='upload_status')return ({success:'成功',failed:'失败',pending:'待上传',uploaded:'已上传',local:'本地存储'} as Record<string,string>)[String(value)]||String(value);
 if(key==='source_label')return typeof value==='string'?value:'';
 if(key==='feature')return featureLabel(value);
 if(key==='order_type')return ({points:'积分充值',membership:'会员开通'} as Record<string,string>)[String(value)]||String(value);
 if(key==='point_change')return `${Number(value)>0?'+':''}${Number(value)}`;
 if(key==='points')return `${Number(value)>0?'-':Number(value)<0?'+':''}${Math.abs(Number(value))}`;
 return String(value);
}
async function load(){if(!canRead(kind.value))return;selected.value=[];busy.value=true;error.value='';try{const params={trashed:kind.value==='parses'&&trashed.value,...Object.fromEntries(Object.entries(filters.value).filter(([,v])=>v!=='')),page:page.value,page_size:size.value,start:dates.value?Math.floor(dates.value[0].getTime()/1000):0,end:dates.value?Math.floor(dates.value[1].getTime()/1000):0};if(kind.value==='dashboard')overview.value=await requestClient.get('/operations/dashboard',{params});else{const data=await requestClient.get<Result>(`/operations/records/${kind.value}`,{params});rows.value=data.items;total.value=data.total;}}catch(e){error.value=e instanceof Error?e.message:'加载失败，请重试';}finally{busy.value=false;}}
function search(){page.value=1;void load();}
const deletingFile=ref('');
async function deleteInvalidFile(row:Row){
 if(deletingFile.value||Number(row.is_valid)!==0)return;
 deletingFile.value=String(row.id);
 try{
  const result=await requestClient.delete<{file_state:string;local_state:string}>(`/operations/files/${encodeURIComponent(String(row.id))}`);
  ElMessage.success(result.file_state==='shared'?'无效记录已删除，共享文件仍被其他记录引用，已保留':result.file_state==='source'?'无效源链接记录已删除，平台源文件不属于本系统':result.local_state==='shared'?'记录与云文件已清理，仍被引用的本地副本已保留':'无效记录及托管文件已清理');
  if(rows.value.length===1&&page.value>1)page.value--;
  await load();
 }catch(e){ElMessage.error(e instanceof Error?e.message:'删除失败，记录保留，请重试');}
 finally{deletingFile.value='';}
}
async function open(row:Row){try{detailName.value=kind.value;selectedUser.value=kind.value==='users'?String(row.openid):'';detail.value=await requestClient.get(kind.value==='users'?`/operations/users/${encodeURIComponent(String(row.openid))}`:`/operations/records/${kind.value}/${encodeURIComponent(String(row.id||row.resource_key))}`,{params:{trashed:kind.value==='parses'&&trashed.value}});tab.value='';history.value=[];historyPage.value=1;historyTotal.value=0;visible.value=true;}catch(e){ElMessage.error(e instanceof Error?e.message:'详情加载失败');}}
const userTabs=computed(()=>[['usage','使用记录','users:read'],['parses','解析记录','parses:read'],['points','积分流水','points:read'],['memberships','会员记录','membership:read'],['logs','管理员操作','users:logs']].filter(v=>access.accessCodes.includes(v[2]!)));
async function historyLoad(){if(!userTabs.value.some(item=>item[0]===tab.value))return;historyBusy.value=true;try{const url=tab.value==='logs'?`/operations/users/${encodeURIComponent(selectedUser.value)}/logs`:`/operations/records/${tab.value}`;const data=await requestClient.get<Result>(url,{params:{openid:selectedUser.value,page:historyPage.value,page_size:20}});history.value=data.items;historyTotal.value=data.total;}catch(e){ElMessage.error(e instanceof Error?e.message:'加载失败');}finally{historyBusy.value=false;}}
async function operate(row:Row,action:'retry'|'cancel'){let max_points=0;try{if(action==='retry'){const q=await requestClient.get<{points:number;availablePoints:number;memberCovered:boolean}>(`/operations/tasks/${kind.value}/${row.id}/quote`);max_points=q.points;await ElMessageBox.confirm(`本次预计扣除 ${q.points} 积分，可用 ${q.availablePoints} 积分${q.memberCovered?'，会员权益覆盖':''}。确认重新排队？`,'重试费用确认',{type:'warning'});}else await ElMessageBox.confirm('取消将协作停止任务并释放冻结额度，保留记录和原视频。确认取消？','取消任务',{type:'warning'});const {value}=await ElMessageBox.prompt('请输入操作原因','操作原因',{inputValidator:v=>!!v?.trim()||'请填写原因'});busy.value=true;await requestClient.post(`/operations/tasks/${kind.value}/${row.id}/${action}`,{max_points,reason:value});ElMessage.success('操作成功');await load();}catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(e instanceof Error?e.message:'操作未完成，请刷新核对');}finally{busy.value=false;}}
const granting=ref(false);const grantType=ref('points');const plans=ref<Row[]>([]);const saving=ref(false);const grant=ref({openid:'',points:0,plan:'',reason:'',business_id:''});
async function openGrant(row:Row,type='points'){grant.value={openid:String(row.openid),points:0,plan:'',reason:'',business_id:crypto.randomUUID()};grantType.value=type;if(type==='membership'){try{plans.value=await requestClient.get('/operations/membership-plans');}catch{ElMessage.error('套餐加载失败');return;}}granting.value=true;}
async function cancelMembership(row:Row){
 if(saving.value)return;
 try{
  const {value}=await ElMessageBox.prompt(`确定取消用户 ${row.openid} 的全部会员权益？包含永久会员，不退款、不扣积分，保留历史记录。请输入原因。`,'取消会员',{type:'warning',inputValidator:v=>!!v?.trim()&&v.trim().length<=200||'请填写1至200字原因',confirmButtonText:'确认取消会员'});
  saving.value=true;
  const result=await requestClient.post<{cancelled:number}>('/memberships/cancel',{openid:row.openid,reason:value.trim()});
  ElMessage.success(result.cancelled?'会员已取消':'该用户已无有效会员');await load();
 }catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(e instanceof Error?e.message:'取消失败，请刷新核对');}
 finally{saving.value=false;}
}
async function grantSave(){if(saving.value)return;if(grantType.value==='membership'&&!grant.value.plan){ElMessage.warning('请选择会员套餐');return;}if(!grant.value.reason.trim()){ElMessage.warning('请输入原因');return;}saving.value=true;try{await requestClient.post(grantType.value==='points'?'/points/grant':'/memberships/grant',grant.value);granting.value=false;ElMessage.success('发放成功');await load();}finally{saving.value=false;}}
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
async function changeRecycle(action:'delete'|'restore',items:Row[]){
 if(recycleSaving.value||!items.length)return;
 const ids=items.map(row=>String(row.id));
 try{
  await ElMessageBox.confirm(action==='delete'?`确认将 ${ids.length} 条解析记录移入回收站？视频和图片文件会保留。`:`确认恢复 ${ids.length} 条解析记录？`,action==='delete'?'删除解析记录':'恢复解析记录',{type:'warning'});
  recycleSaving.value=true;
  const result=await requestClient.post<{changed:number}>(`/operations/parses/${action}`,{ids});
  ElMessage.success(`已${action==='delete'?'删除':'恢复'} ${result.changed} 条记录`);
  visible.value=false;await load();
  if(!rows.value.length&&page.value>1){page.value-=1;await load();}
 }catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(e instanceof Error?e.message:'操作失败，请刷新重试');}
 finally{recycleSaving.value=false;}
}
function toggleRecycle(){trashed.value=!trashed.value;page.value=1;selected.value=[];void load();}
watch(resource,()=>{kind.value=resource.value;},{immediate:true});
watch(kind,()=>{trashed.value=false;selected.value=[];page.value=1;rows.value=[];visible.value=false;filters.value={openid:'',status:'',platform:'',output_mode:'',run_id:'',resource_key:String(route.query.resource_key||''),feature:'',is_valid:''};void load();},{immediate:true});
</script>
<template>
<Page :title="String(route.meta.title)" description="运营记录与任务管理">
<ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-4" />
<ElTabs v-if="resource==='parses'" v-model="kind" class="mb-4" :before-leave="()=>!recycleSaving">
<ElTabPane v-for="c in choices" :key="c[0]" :name="c[0]!" :label="c[1]" />
</ElTabs>
<div class="mb-4 flex flex-wrap gap-3">
<ElSelect v-if="resource!=='parses'&&choices.length>1" v-model="kind" style="width:180px"><ElOption v-for="c in choices" :key="c[0]" :value="c[0]!" :label="c[1]" /></ElSelect>
<ElInput v-if="!['dashboard','resources','files'].includes(kind)" v-model="filters.openid" placeholder="完整 OpenId" clearable style="width:240px" @keyup.enter="search" />
<ElSelect v-if="['subtitle','watermark','points','orders','parses','resources'].includes(kind)" v-model="filters.status" clearable placeholder="全部状态" style="width:150px"><ElOption v-for="s in statusOptions" :key="s[0]" :value="s[0]!" :label="s[1]" /></ElSelect>
<ElInput v-if="['parses','resources'].includes(kind)" v-model="filters.platform" placeholder="平台" clearable style="width:130px" />
<template v-if="['resources','files'].includes(kind)"><ElInput v-model="filters.resource_key" placeholder="资源标识" clearable style="width:220px" /><ElInput v-model="filters.run_id" placeholder="批次" clearable style="width:170px" /><ElInput v-model="filters.output_mode" placeholder="模式" clearable style="width:120px" /></template>
<ElSelect v-if="kind==='files'" v-model="filters.is_valid" clearable placeholder="有效状态" style="width:130px"><ElOption label="有效" value="1" /><ElOption label="失效" value="0" /></ElSelect>
<AppDatePicker v-if="kind!=='users'" v-model="dates" type="datetimerange" start-placeholder="开始时间" end-placeholder="结束时间" />
<ElButton :loading="busy" type="primary" @click="search">查询</ElButton>
<template v-if="kind==='parses'"><ElButton :disabled="busy||recycleSaving" @click="toggleRecycle">{{trashed?'返回解析记录':'回收站'}}</ElButton><ElButton v-if="canRecycle" :type="trashed?'primary':'danger'" :disabled="!selected.length||busy" :loading="recycleSaving" @click="changeRecycle(trashed?'restore':'delete',selected)">{{trashed?'批量恢复':'批量删除'}}（{{selected.length}}）</ElButton></template>
</div>
<template v-if="kind==='dashboard'"><ElAlert title="用户数为累计；其余指标按创建时间筛选。成功率仅统计成功和失败任务，排除取消、处理中及已过期任务。积分统计已结算的实际消费。" type="info" :closable="false" class="mb-4" /><div class="grid gap-4 md:grid-cols-4"><ElCard v-for="(value,key) in overview" :key="key"><div>{{labels[key]}}</div><div class="mt-4 text-3xl">{{value??'暂无数据'}}</div></ElCard></div></template>
<ElCard v-else><ElAlert v-if="kind==='points'" title="余额为该笔操作发生时的总积分（含冻结部分）；历史流水未记录余额时显示 —。冻结、释放的总积分变动为 0。" type="info" :closable="false" class="mb-4" /><ElAlert v-if="kind==='parses'&&trashed" title="回收站：记录可恢复，关联视频和图片未删除。" type="info" :closable="false" class="mb-4" /><ElTable v-loading="busy||recycleSaving" :data="rows" :row-key="(row:Row)=>String(row.id||row.resource_key||row.openid)" stripe border empty-text="暂无记录" @selection-change="selected=$event"><ElTableColumn v-if="kind==='users'" label="头像" width="80"><template #default="{row}"><ElAvatar :size="44" :src="String(row.avatar_url||'')">用户</ElAvatar></template></ElTableColumn><ElTableColumn v-if="kind==='parses'&&canRecycle" type="selection" width="48" /><ElTableColumn v-if="kind==='files'" label="预览" width="130"><template #default="s"><MediaFilePreview :file="s.row" compact /></template></ElTableColumn><ElTableColumn v-for="key in columns" :key="key" :label="labels[key]" :min-width="['share_text','source_url'].includes(key)?360:key==='openid'||key==='error'?220:150" show-overflow-tooltip><template #header><ElTooltip v-if="key==='share_parse_count'" content="累计分享链接解析记录数，含成功、失败和回收站记录，不含文案提取" placement="top"><span class="cursor-help">{{labels[key]}} ⓘ</span></ElTooltip><ElTooltip v-else-if="key==='output_mode'" placement="top"><template #content><div style="max-width:360px;line-height:1.7"><p>{{modeHelp('cache')}}</p><p class="mt-2">{{modeHelp('direct')}}</p></div></template><span class="cursor-help" tabindex="0">{{labels[key]}} ⓘ</span></ElTooltip><span v-else>{{labels[key]}}</span></template><template #default="s"><ElTag v-if="key==='is_vip'" class="user-member-tag" :effect="s.row.is_vip?'dark':'light'" :type="s.row.is_vip?'warning':'info'">{{show(key,s.row[key],s.row)}}</ElTag><ElTag v-else-if="key==='output_mode'||key==='status'||key==='is_valid'">{{show(key,s.row[key],s.row)}}</ElTag><span v-else-if="kind==='users'&&['share_parse_count','balance'].includes(key)" class="user-stat" :class="key==='balance'?'user-stat-balance':'user-stat-parses'">{{show(key,s.row[key],s.row)}}</span><CopyValue v-else-if="kind==='resources'&&key==='resource_key'" :value="s.row.resource_key" label="复制资源标识"><ElButton v-if="canRead('files')" link type="primary" style="white-space:normal;overflow-wrap:anywhere;height:auto" @click="openResourceFiles(s.row)">{{s.row.resource_key}}</ElButton><span v-else>{{s.row.resource_key}}</span></CopyValue><CopyValue v-else-if="['source_url','object_url','object_key','audio_url','share_text'].includes(key)" :value="s.row[key]" :label="'复制'+labels[key]" /><span v-else :class="key==='balance_after'?'point-balance':key==='point_change'?changeClass(s.row[key]):key==='source_label'?sourceClass(s.row):undefined">{{show(key,s.row[key],s.row)}}</span></template></ElTableColumn><ElTableColumn label="操作" fixed="right" :width="kind==='users'?210:task?260:180"><template #default="s"><ElButton link type="primary" @click="open(s.row)">详情</ElButton><ElButton v-if="kind==='users'&&access.accessCodes.includes('points:read')" link type="primary" @click="openUserPoints(s.row)">积分流水</ElButton><ElButton v-if="kind==='files'&&Number(s.row.is_valid)===0&&access.accessCodes.includes('files:delete')" link type="danger" :loading="deletingFile===String(s.row.id)" :disabled="busy||!!deletingFile" @click="deleteInvalidFile(s.row)">删除</ElButton><ElButton v-if="kind==='parses'&&canRecycle" link :type="trashed?'primary':'danger'" :disabled="busy||recycleSaving" @click="changeRecycle(trashed?'restore':'delete',[s.row])">{{trashed?'恢复':'删除'}}</ElButton><template v-if="task"><ElButton v-if="access.accessCodes.includes(`${kind}:retry`)" link :disabled="busy||Number(s.row.status)!==2" @click="operate(s.row,'retry')">重试</ElButton><ElButton v-if="access.accessCodes.includes(`${kind}:cancel`)" link type="danger" :disabled="busy||Number(s.row.status)!==0" @click="operate(s.row,'cancel')">取消</ElButton></template><ElDropdown v-if="kind==='users'&&['points:grant','points:deduct','membership:grant'].some(code=>access.accessCodes.includes(code))" trigger="click" class="ml-3" :disabled="saving">
<ElButton link type="primary" :disabled="saving">更多 ▾</ElButton>
<template #dropdown><ElDropdownMenu>
<ElDropdownItem v-if="access.accessCodes.includes('points:grant')" :disabled="saving" @click="openGrant(s.row)">发放积分</ElDropdownItem>
<ElDropdownItem v-if="access.accessCodes.includes('points:deduct')" :disabled="saving" @click="openDeduct(s.row)">扣除积分</ElDropdownItem>
<ElDropdownItem v-if="access.accessCodes.includes('membership:grant')" :disabled="saving" @click="openGrant(s.row,'membership')">{{s.row.is_vip?'续费会员':'开通会员'}}</ElDropdownItem>
<ElDropdownItem v-if="s.row.is_vip&&access.accessCodes.includes('membership:grant')" :disabled="saving" @click="cancelMembership(s.row)"><span class="text-red-500">取消会员</span></ElDropdownItem>
</ElDropdownMenu></template></ElDropdown></template></ElTableColumn></ElTable><ElPagination v-model:current-page="page" v-model:page-size="size" class="mt-4" :total="total" :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next, jumper, slot" @current-change="load" @size-change="search" style="justify-content:center;flex-wrap:wrap;row-gap:8px"><ElButton size="small" :disabled="page<=1" @click="page=1;load()">首页</ElButton><ElButton size="small" :disabled="page>=Math.max(1,Math.ceil((total)/(size)))" @click="page=Math.max(1,Math.ceil((total)/(size)));load()">末页</ElButton></ElPagination></ElCard>
<ElDialog v-model="pointsOpen" title="积分流水" width="min(1100px,94vw)" destroy-on-close>
 <template v-if="pointsOpen">
  <div class="mb-4 flex items-center justify-between"><strong>积分余额：{{pointsBalance??'—'}}</strong><ElButton :loading="pointsBusy" @click="loadUserPoints">刷新</ElButton></div>
  <ElAlert v-if="pointsError" :title="pointsError" type="error" class="mb-3"/>
  <ElTable v-loading="pointsBusy" :data="pointsRows" row-key="id" border empty-text="暂无积分流水">
   <ElTableColumn v-for="field in ['source_label','balance_before','point_change','balance_after','created']" :key="field" :label="field==='source_label'?'积分来源／用途':labels[field]" :min-width="field==='created'?180:field==='source_label'?180:120"><template #default="{row}"><span :class="field==='balance_after'?'point-balance':field==='point_change'?changeClass(row[field]):field==='source_label'?sourceClass(row):undefined">{{show(field,row[field],row)}}</span></template></ElTableColumn>
  </ElTable>
  <ElPagination v-model:current-page="pointsPage" :total="pointsTotal" :page-size="20" layout="total, prev, pager, next, jumper, slot" class="mt-3" @current-change="loadUserPoints" style="justify-content:center;flex-wrap:wrap;row-gap:8px"><ElButton size="small" :disabled="pointsPage<=1" @click="pointsPage=1;loadUserPoints()">首页</ElButton><ElButton size="small" :disabled="pointsPage>=Math.max(1,Math.ceil((pointsTotal)/(20)))" @click="pointsPage=Math.max(1,Math.ceil((pointsTotal)/(20)));loadUserPoints()">末页</ElButton></ElPagination>
 </template>
</ElDialog>
<ElDialog v-model="resourceFilesOpen" title="资源关联文件" width="min(1400px,96vw)" append-to-body destroy-on-close>
 <template v-if="resourceFilesOpen">
  <div class="mb-3">资源标识：<CopyValue :value="resourceFilesKey" label="复制资源标识" /></div>
  <ElAlert v-if="resourceFilesError" :title="resourceFilesError" type="error" class="mb-3"/>
  <ElButton class="mb-3" :loading="resourceFilesBusy" @click="loadResourceFiles">刷新</ElButton>
  <ElCard shadow="never" class="mb-3"><template #header><strong>视频文案</strong></template><div v-loading="resourceFilesBusy" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto"><CopyValue :value="resourceCaption" label="复制视频文案">{{resourceCaption || (resourceFilesBusy?'加载中…':'暂无视频文案')}}</CopyValue></div></ElCard>
  <ElTable v-loading="resourceFilesBusy" :data="resourceFiles" row-key="id" border empty-text="暂无关联文件">
   <ElTableColumn label="预览" width="130"><template #default="{row}"><MediaFilePreview :file="row" compact/></template></ElTableColumn>
   <ElTableColumn v-for="field in ['media_type','is_valid','upload_status','output_mode','run_id','file_size']" :key="field" :label="labels[field]" min-width="130"><template #default="{row}">{{show(field,row[field],row)}}</template></ElTableColumn>
   <ElTableColumn label="文件地址" min-width="260"><template #default="{row}"><CopyValue :value="row.object_url" label="复制文件地址"/></template></ElTableColumn>
  </ElTable>
  <ElPagination v-model:current-page="resourceFilesPage" :total="resourceFilesTotal" :page-size="20" layout="total, prev, pager, next, jumper, slot" class="mt-3" @current-change="loadResourceFiles" style="justify-content:center;flex-wrap:wrap;row-gap:8px"><ElButton size="small" :disabled="resourceFilesPage<=1" @click="resourceFilesPage=1;loadResourceFiles()">首页</ElButton><ElButton size="small" :disabled="resourceFilesPage>=Math.max(1,Math.ceil((resourceFilesTotal)/(20)))" @click="resourceFilesPage=Math.max(1,Math.ceil((resourceFilesTotal)/(20)));loadResourceFiles()">末页</ElButton></ElPagination>
 </template>
</ElDialog>
<ElDialog v-model="visible" title="记录详情" width="85%"><div v-if="visible&&detailName==='files'" class="mb-4"><MediaFilePreview :file="detail" /></div><ElDescriptions :column="2" border><ElDescriptionsItem v-for="(value,key) in detailFields" :key="key" :label="detailName==='users'&&key==='plan_name'?'有效会员':detailName==='users'&&key==='expires'?'会员到期':labels[key]||String(key)"><CopyValue v-if="['source_url','object_url','object_key','audio_url','video_url','image_url','input_path','output_path'].includes(String(key))" :value="value" :label="'复制'+(labels[key]||String(key))" /><span v-else :class="key==='balance_after'?'point-balance':key==='point_change'?changeClass(value):key==='source_label'?sourceClass(detail):undefined">{{show(String(key),value,detail)}}</span></ElDescriptionsItem></ElDescriptions>
<ParseDetail v-if="['parses','resources'].includes(detailName)" :detail="detail" :can-resources="canRead('resources')" :can-files="canRead('files')" /><ElButton v-if="detailName==='resources'&&canRead('files')" class="mt-4" @click="openResourceFiles(detail)">查看关联文件</ElButton><template v-if="selectedUser"><div class="my-4 flex gap-2"><ElButton v-for="t in userTabs" :key="t[0]" :type="tab===t[0]?'primary':'default'" @click="tab=t[0]!;historyPage=1;historyLoad()">{{t[1]}}</ElButton></div><ElTable v-if="tab" v-loading="historyBusy" :data="history" border empty-text="暂无记录"><ElTableColumn v-for="key in columnMap[tab]" :key="key" :label="labels[key]" :min-width="key==='share_text'?360:160" :show-overflow-tooltip="key!=='share_text'"><template #default="s"><CopyValue v-if="tab==='parses'&&key==='share_text'" class="history-share-copy" :value="s.row.share_text" label="复制原始分享内容"><ElTooltip placement="right-start" :offset="16" :show-after="350" :hide-after="0" :enterable="false" :disabled="!s.row.share_text"><template #content><div style="max-width:360px;max-height:180px;overflow:auto;white-space:normal;overflow-wrap:anywhere;line-height:1.6">{{s.row.share_text}}</div></template><span class="history-share-text">{{show(key,s.row[key],s.row)}}</span></ElTooltip></CopyValue><span v-else :class="key==='balance_after'?'point-balance':key==='point_change'?changeClass(s.row[key]):key==='source_label'?sourceClass(s.row):undefined">{{show(key,s.row[key],s.row)}}</span></template></ElTableColumn></ElTable><ElPagination v-if="tab" v-model:current-page="historyPage" :total="historyTotal" :page-size="20" layout="total, prev, pager, next, jumper, slot" @current-change="historyLoad" style="justify-content:center;flex-wrap:wrap;row-gap:8px"><ElButton size="small" :disabled="historyPage<=1" @click="historyPage=1;historyLoad()">首页</ElButton><ElButton size="small" :disabled="historyPage>=Math.max(1,Math.ceil((historyTotal)/(20)))" @click="historyPage=Math.max(1,Math.ceil((historyTotal)/(20)));historyLoad()">末页</ElButton></ElPagination></template></ElDialog>
<ElDialog v-model="granting" :title="grantType==='membership'?'开通／续费会员（不代表微信支付）':'人工发放积分'" width="520px"><ElForm label-position="top"><ElFormItem label="用户"><ElInput v-model="grant.openid" disabled /></ElFormItem><ElFormItem v-if="grantType==='points'" label="积分"><ElInputNumber v-model="grant.points" :min="0" :precision="0" /></ElFormItem><ElFormItem v-else label="会员套餐"><ElSelect v-model="grant.plan"><ElOption v-for="p in plans" :key="String(p.code)" :label="String(p.name)" :value="String(p.code)" /></ElSelect></ElFormItem><ElFormItem label="原因"><ElInput v-model="grant.reason" maxlength="200" /></ElFormItem></ElForm><template #footer><ElButton :loading="saving" type="primary" @click="grantSave">确认发放</ElButton></template></ElDialog>
<ElDialog v-model="deducting" title="扣除积分" width="520px" :close-on-click-modal="false" :close-on-press-escape="!deductSaving" :show-close="!deductSaving">
<ElForm label-position="top" :disabled="deductSaving"><ElFormItem label="用户"><ElInput :model-value="deduction.openid" disabled /></ElFormItem>
<ElAlert :title="`当前可用积分：${availablePoints}（不含冻结积分）`" type="warning" :closable="false" class="mb-4" />
<ElFormItem label="扣除积分"><ElInputNumber v-model="deduction.points" :min="1" :max="1000000000" :precision="0" /></ElFormItem>
<ElFormItem label="扣除原因（必填）"><ElInput v-model="deduction.reason" type="textarea" maxlength="200" show-word-limit /></ElFormItem></ElForm>
<template #footer><ElButton :disabled="deductSaving" @click="deducting=false">取消</ElButton><ElButton :loading="deductSaving" type="danger" @click="deductSave">确认扣除</ElButton></template>
</ElDialog>
</Page>
</template>

<style scoped>
.history-share-copy { display:flex; align-items:center; width:100%; min-width:0; white-space:nowrap; }
.history-share-text { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.history-share-copy :deep(.copy-icon) { flex-shrink:0; }

.point-balance { font-weight:700; font-variant-numeric:tabular-nums; }
.user-stat { display:inline-block; padding:2px 10px; border-radius:6px; font-size:15px; font-weight:700; font-variant-numeric:tabular-nums; }
.user-stat-parses { color:var(--el-color-primary); background:var(--el-color-primary-light-9); }
.user-stat-balance { color:var(--el-color-success); background:var(--el-color-success-light-9); }
.user-member-tag { font-weight:600; }

.point-change { display:inline-block; padding:2px 8px; border-radius:5px; font-weight:700; font-size:15px; font-variant-numeric:tabular-nums; }
.point-increase { color:var(--el-color-success); background:var(--el-color-success-light-9); }
.point-decrease { color:var(--el-color-danger); background:var(--el-color-danger-light-9); }
.point-neutral { color:var(--el-text-color-secondary); }

.point-source { display:inline-block; padding:3px 9px; border-radius:5px; font-weight:600; line-height:1.5; }
.point-source-reward { color:var(--el-color-success); background:var(--el-color-success-light-9); }
.point-source-manual { color:var(--el-color-warning); background:var(--el-color-warning-light-9); }
.point-source-deduct { color:var(--el-color-danger); background:var(--el-color-danger-light-9); }
.point-source-usage { color:var(--el-color-primary); background:var(--el-color-primary-light-9); }
.point-source-unknown { color:var(--el-text-color-secondary); background:var(--el-fill-color-light); }
</style>
