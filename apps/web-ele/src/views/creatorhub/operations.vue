<script setup lang="ts">
import { featureLabel } from '#/utils/feature-label';
import { adminActionLabel } from '#/utils/admin-action';
import CopyValue from '#/components/copy-value.vue';
import { computed, onDeactivated, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';
import { ElDropdown,ElDropdownMenu,ElDropdownItem,ElAvatar,ElAlert,ElButton,ElCard,ElDescriptions,ElDescriptionsItem,ElDialog,ElForm,ElFormItem,ElInput,ElInputNumber,ElMessage,ElMessageBox,ElOption,ElPagination,ElSelect,ElSwitch,ElTable,ElTableColumn,ElTabs,ElTabPane,ElTag,ElTooltip } from 'element-plus';
import { requestClient } from '#/api/request';
import ParseDetail from './parse-detail.vue';
import MediaFilePreview from './media-file-preview.vue';
import LoginHistoryDialog from './login-history-dialog.vue';
import AppDatePicker from '#/components/app-date-picker.vue';
type Row=Record<string,unknown>;
type Result={items:Row[];total:number};
const route=useRoute();const access=useAccessStore();
const resource=computed(()=>String(route.meta.resource||'dashboard'));
const developmentSaving=ref<Record<string,boolean>>({});
async function toggleDevelopment(row:Row):Promise<boolean>{
 const openid=String(row.openid||'');
 if(!openid||developmentSaving.value[openid]||!access.accessCodes.includes('users:development'))return false;
 const development=!(row.development===true||Number(row.development)===1);
 try{await ElMessageBox.confirm(development?'设为开发者后，该用户可在小程序更新服务端元宝 Cookie，并沿用开发者账号不能发起虚拟支付的规则。':'取消开发者后，该用户不能再更新元宝 Cookie，等待中的扫码会话将被取消。','确认'+(development?'设置':'取消')+'开发者账号',{type:'warning'});}catch{return false;}
 developmentSaving.value[openid]=true;
 try{
  const result=await requestClient.put<{openid:string;development:boolean}>(`/users/${encodeURIComponent(openid)}/development`,{development});
  row.development=result.development;
  if(detailName.value==='users'&&detail.value.openid===openid)detail.value.development=result.development;
  ElMessage.success('开发者状态已更新，小程序刷新“我的”页面后更新入口');
  return true;
 }catch{return false;}finally{developmentSaving.value[openid]=false;}
}
const kind=ref('');const page=ref(1);const size=ref(20);const rows=ref<Row[]>([]);const total=ref(0);const busy=ref(false);const error=ref('');const dates=ref<[Date,Date]|null>(null);
const userCreatedDates=ref<[Date,Date]|null>(null),userLoginDates=ref<[Date,Date]|null>(null);
const filters=ref({openid:'',nickname:'',status:'',platform:'',output_mode:'',run_id:'',resource_key:'',feature:'',is_valid:''});
const loginHistoryOpen=ref(false),loginHistoryOwner=ref('');
function openLoginHistory(row:Row){if(!access.accessCodes.includes('users:read'))return;loginHistoryOwner.value=String(row.openid);loginHistoryOpen.value=true;}
watch(()=>route.fullPath,()=>{loginHistoryOpen.value=false;});
onDeactivated(()=>{loginHistoryOpen.value=false;});
const overview=ref<Row>({});const detail=ref<Row>({});const visible=ref(false);const detailName=ref('');const selectedUser=ref('');const tab=ref('');const history=ref<Row[]>([]);const historyTotal=ref(0);const historyPage=ref(1);const historyBusy=ref(false);const loginRecordSelection=ref<Row[]>([]);
const overviewGroups=[
 {id:'general',title:'基础数据',description:'用户数为累计；解析次数和实际消费积分按记录创建时间筛选。',metrics:['users','parses','consumed_points']},
 {id:'transcripts',title:'视频文案提取',description:'成功次数包含同步和异步结果，链接、上传是其中的分项。异步任务单独统计，成功率不包含同步失败及取消任务。',metrics:['transcript_success','transcript_url_success','transcript_upload_success','text_task_completed','text_task_success_rate']},
 {id:'subtitle',title:'视频去字幕',description:'已结束任务只计成功和失败，排除取消、处理中及已过期任务。',metrics:['subtitle_completed','subtitle_success_rate']},
 {id:'watermark',title:'视频去水印',description:'已结束任务只计成功和失败，排除取消、处理中及已过期任务。',metrics:['watermark_completed','watermark_success_rate']},
];
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
const resourceFilesSelected=ref<Row[]>([]);
let resourceFilesVersion=0;
async function loadResourceFiles(){
 const version=++resourceFilesVersion;resourceFilesBusy.value=true;resourceFilesError.value='';resourceFilesSelected.value=[];resourceFiles.value=[];resourceCaption.value='';
 try{const [result,resourceDetail]=await Promise.all([requestClient.get<Result>('/operations/records/files',{params:{resource_key:resourceFilesKey.value,page:resourceFilesPage.value,page_size:20}}),requestClient.get<Row>(`/operations/records/resources/${encodeURIComponent(resourceFilesKey.value)}`)]);if(version===resourceFilesVersion){resourceFiles.value=result.items;resourceFilesTotal.value=result.total;resourceCaption.value=String(resourceDetail.title||'');}}
 catch(e){if(version===resourceFilesVersion)resourceFilesError.value=e instanceof Error?e.message:'关联文件加载失败';}
 finally{if(version===resourceFilesVersion)resourceFilesBusy.value=false;}
}
function openResourceFiles(row:Row){if(!canRead('files'))return;resourceFilesKey.value=String(row.resource_key);resourceFilesPage.value=1;resourceFilesTotal.value=0;resourceFilesOpen.value=true;void loadResourceFiles();}
watch(resourceFilesOpen,value=>{if(!value){resourceFilesVersion++;resourceFilesSelected.value=[];resourceFiles.value=[];resourceFilesBusy.value=false;}});
watch(kind,()=>{resourceFilesOpen.value=false;});
const parseResourcesOpen=ref(false),parseResourcesBusy=ref(false),parseResourcesError=ref('');
const parseResources=ref<Row[]>([]),parseResourcesShare=ref(''),parseResourcesNote=ref('');
let parseResourcesVersion=0;
function clearParseResources(){parseResourcesVersion++;parseResources.value=[];parseResourcesBusy.value=false;parseResourcesError.value='';parseResourcesShare.value='';parseResourcesNote.value='';}
async function openParseResources(row:Row,fromHistory=false){
 if(!canRead('parses')||!canRead('resources')||!row.id||!row.share_text)return;
 clearParseResources();parseResourcesOpen.value=true;parseResourcesShare.value=String(row.share_text);
 const version=++parseResourcesVersion,currentPath=route.fullPath;
 parseResourcesBusy.value=true;
 try{
  const result=await requestClient.get<Row>(`/operations/records/parses/${encodeURIComponent(String(row.id))}`,{params:{trashed:!fromHistory&&kind.value==='parses'&&trashed.value}});
  if(version!==parseResourcesVersion||!parseResourcesOpen.value||route.fullPath!==currentPath)return;
  parseResources.value=Array.isArray(result.related_resources)?result.related_resources:[];
  parseResourcesShare.value=String(result.share_text||row.share_text);
  parseResourcesNote.value=String(result.association_note||'按完整分享链接匹配当前共享资源，包含缓存及直连模式。');
 }catch(e){if(version===parseResourcesVersion&&parseResourcesOpen.value&&route.fullPath===currentPath)parseResourcesError.value=e instanceof Error?e.message:'共享资源加载失败，请重试';}
 finally{if(version===parseResourcesVersion)parseResourcesBusy.value=false;}
}
watch(parseResourcesOpen,value=>{if(!value)clearParseResources();},{flush:'sync'});
watch(()=>route.fullPath,()=>{parseResourcesOpen.value=false;},{flush:'sync'});
watch(kind,()=>{parseResourcesOpen.value=false;});
onDeactivated(()=>{parseResourcesOpen.value=false;});
onUnmounted(clearParseResources);
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

type UserDeletionPreview={openid:string;tables:Record<string,number>;private_local_files:number;cloud_files:number;blockers:string[];can_delete:boolean;preview_token:string};
const deletionOpen=ref(false),deletionBusy=ref(false),deletionSaving=ref(false),deletionOwner=ref(''),deletionConfirm=ref(''),deletionReason=ref(''),deletionError=ref('');
const deletionPreview=ref<UserDeletionPreview|null>(null);
let deletionVersion=0;
const deletionTableLabels:Record<string,string>={user_login_records:'登录记录',system_error_logs:'用户相关错误日志',user_avatar_files:'用户头像文件',sessions:'登录会话',client_logs:'客户端日志',video_transcripts:'视频文案',share_parse_records:'分享解析记录',video_subtitle_tasks:'去字幕任务',video_watermark_tasks:'去水印任务',user_point_records:'积分流水',user_reward_records:'奖励记录',user_recharge_orders:'充值订单',user_feature_usage:'功能用量',user_memberships:'会员记录',user_point_accounts:'积分账户',users:'用户资料',virtual_payment_orders:'虚拟支付订单',text_extraction_tasks:'文案提取任务',worker_tasks:'后台工作任务',admin_user_logs_delete:'删除旧用户操作日志',admin_user_logs_trim:'清理旧日志关联'};
const canDeleteUser=computed(()=>deletionOpen.value&&kind.value==='users'&&access.accessCodes.includes('users:delete')&&!deletionBusy.value&&!deletionSaving.value&&deletionPreview.value?.openid===deletionOwner.value&&deletionPreview.value?.can_delete===true&&!deletionPreview.value.blockers.length&&!!deletionPreview.value.preview_token&&deletionConfirm.value===deletionOwner.value&&!!deletionReason.value.trim()&&deletionReason.value.trim().length<=200);
function clearUserDeletion(){deletionVersion++;deletionOpen.value=false;deletionPreview.value=null;deletionBusy.value=false;deletionConfirm.value='';deletionReason.value='';}
async function loadDeletionPreview(){
 if(!deletionOpen.value||deletionSaving.value||!access.accessCodes.includes('users:delete'))return;
 const version=++deletionVersion,openid=deletionOwner.value;
 deletionBusy.value=true;deletionPreview.value=null;deletionError.value='';
 try{
  const result=await requestClient.get<UserDeletionPreview>(`/operations/users/${encodeURIComponent(openid)}/deletion-preview`);
  if(version!==deletionVersion)return;
  if(result.openid!==openid)throw new Error('预览用户不一致，请刷新预览');
  deletionPreview.value=result;
 }catch(e){if(version===deletionVersion)deletionError.value=e instanceof Error?e.message:'预览加载失败，请重试';}
 finally{if(version===deletionVersion)deletionBusy.value=false;}
}
async function openUserDeletion(row:Row){
 if(deletionSaving.value||kind.value!=='users'||!access.accessCodes.includes('users:delete'))return;
 deletionOwner.value=String(row.openid);deletionConfirm.value='';deletionReason.value='';deletionOpen.value=true;
 await loadDeletionPreview();
}
async function submitUserDeletion(){
 if(!canDeleteUser.value||!deletionPreview.value)return;
 const version=deletionVersion,openid=deletionOwner.value,preview_token=deletionPreview.value.preview_token;
 deletionSaving.value=true;deletionError.value='';
 try{
  const result=await requestClient.post<{deleted:boolean;openid:string}>(`/operations/users/${encodeURIComponent(openid)}/delete`,{confirm_openid:deletionConfirm.value,preview_token,reason:deletionReason.value.trim()});
  if(version!==deletionVersion)return;
  if(!result.deleted||result.openid!==openid)throw new Error('删除结果不明确，请刷新预览核对');
  clearUserDeletion();visible.value=false;pointsOpen.value=false;
  ElMessage.success('用户及其私有数据已删除');
  if(rows.value.length===1&&page.value>1)page.value--;
  await load();
 }catch(e){if(version===deletionVersion){deletionPreview.value=null;deletionError.value=(e instanceof Error?e.message:'删除未完成')+'；请刷新预览核对后重试';}}
 finally{deletionSaving.value=false;}
}
watch(deletionOpen,value=>{if(!value)clearUserDeletion();},{flush:'sync'});
watch(()=>route.fullPath,clearUserDeletion,{flush:'sync'});
onDeactivated(clearUserDeletion);onUnmounted(clearUserDeletion);

const labels:Record<string,string>={register_region:'注册 IP 归属地',last_login_region:'最新 IP 归属地',region:'IP 归属地',region_source:'解析来源',region_resolved_at:'地区解析时间',register_ip:'注册 IP',last_login_ip:'最新登录 IP',last_login_at:'最新登录时间',ip:'登录 IP',method:'登录方式',ledger_user_info:'用户信息',user_info:'用户信息',ip_info:'IP信息',member_info:'会员信息',time_info:'时间信息',nickname:'昵称',created_at:'创建时间',updated_at:'更新时间',is_vip:'会员状态',plan_name:'会员套餐',share_parse_count:'分享链接解析次数',source_label:'积分来源',source_url:'完整分享链接',object_url:'文件地址',association_note:'关联说明',object_key:'文件路径',content_md5:'内容 MD5',id:'记录编号',openid:'用户 OpenId',development:'开发账号',status:'状态',deleted_at:'删除时间',deleted_by:'删除管理员ID',scene:'场景',platform:'平台',title:'标题',share_text:'原始分享内容',error_code:'错误码',created:'创建时间',finished:'完成时间',updated:'更新时间',resource_key:'资源标识',output_mode:'模式',run_id:'批次',is_valid:'有效状态',upload_status:'上传状态',media_type:'媒体类型',position:'顺序',storage_type:'存储类型',storage_ref:'存储引用',bucket_code:'存储桶',file_size:'文件大小',fallback_reason:'回退原因',cleanup_pending:'待清理',progress:'进度（%）',error:'错误原因',detected_frames:'修复帧数',duration:'时长（秒）',size:'文件大小',width:'视频宽度',height:'视频高度',x:'区域 X',y:'区域 Y',w:'区域宽',h:'区域高',started:'开始时间',expires:'到期时间',cancelled:'已取消',feature:'功能',day:'日期',balance_before:'变动前积分',point_change:'变动积分',balance_after:'积分余额',points:'积分变动',duration_ms:'用量（毫秒）',business_id:'业务编号',plan_code:'会员套餐',starts:'生效时间',balance:'积分余额',reserved:'冻结积分',used_count:'已用次数',reserved_count:'冻结次数',used_ms:'已用时长（毫秒）',reserved_ms:'冻结时长（毫秒）',order_type:'订单类型',amount_fen:'金额（元）',paid_at:'支付时间',admin_username:'操作管理员账号',admin_id:'管理员编号',action:'操作',target:'操作目标',users:'累计用户数',parses:'解析次数',consumed_points:'实际消耗积分',subtitle_completed:'去字幕已结束任务',subtitle_success_rate:'去字幕成功率（%）',watermark_completed:'去水印已结束任务',watermark_success_rate:'去水印成功率（%）',transcript_success:'文案提取成功次数',transcript_url_success:'链接文案提取成功次数',transcript_upload_success:'上传文案提取成功次数',text_task_completed:'异步文案已结束任务',text_task_success_rate:'异步文案成功率（%）'};
const columnMap:Record<string,string[]>={login_records:['ip','region','method','created'],users:['user_info','ip_info','member_info','share_parse_count','reserved','time_info'],parses:['openid','nickname','platform','scene','status','share_text','created'],resources:['resource_key','share_text','source_url','platform','output_mode','status','run_id','updated'],files:['resource_key','media_type','is_valid','upload_status','output_mode','run_id','file_size'],subtitle:['openid','nickname','status','progress','duration','error','created'],watermark:['openid','nickname','status','progress','duration','error','created'],points:['openid','nickname','source_label','balance_before','point_change','balance_after','status','created'],memberships:['openid','nickname','plan_code','starts','expires'],orders:['openid','nickname','order_type','status','amount_fen','points','created'],usage:['feature','day','used_count','reserved_count','used_ms'],logs:['admin_username','action','target','created']};
const trashed=ref(false);const selected=ref<Row[]>([]);const recycleSaving=ref(false);const parseDeleteOpen=ref(false);const parseDeleteItems=ref<Row[]>([]);
const platformOptions=[
 {value:'douyin',label:'抖音 (douyin)'},{value:'xiaohongshu',label:'小红书 (xiaohongshu)'},
 {value:'bilibili',label:'B站 (bilibili)'},{value:'kuaishou',label:'快手 (kuaishou)'},
 {value:'xigua',label:'西瓜视频 (xigua)'},{value:'toutiao',label:'今日头条 (toutiao)'},
 {value:'weibo',label:'微博 (weibo)'},{value:'dongchedi',label:'懂车帝 (dongchedi)'},
 {value:'pipixia',label:'皮皮虾 (pipixia)'},{value:'youtube',label:'YouTube (youtube)'},
];
function normalizePlatformFilter(){
 const value=String(filters.value.platform||'').trim();
 const option=platformOptions.find(item=>item.value===value.toLowerCase()||item.label.split(' (')[0]?.toLowerCase()===value.toLowerCase());
 filters.value.platform=option?.value||value;
}
const parseColumnWidths:Record<string,number>={nickname:80,platform:120,scene:128,status:72};
const columns=computed(()=>kind.value==='users'?(columnMap.users||[]).filter(key=>key!=='reserved'||rows.value.some(row=>Number(row.reserved)>0)):kind.value==='parses'&&trashed.value?[...(columnMap.parses||[]),'deleted_at','deleted_by']:columnMap[kind.value]||[]);
const task=computed(()=>['subtitle','watermark'].includes(kind.value));
const choices=computed(()=>[[resource.value,String(route.meta.title)]]);
const canRecycle=computed(()=>access.accessCodes.includes(trashed.value?'parses:restore':'parses:delete'));const canPurge=computed(()=>access.accessCodes.includes('parses:purge'));
const canRead=(name:string)=>access.accessCodes.includes(`${name==='memberships'?'membership':name}:read`);
const statusOptions=computed(()=>task.value?[['0','处理中'],['1','成功'],['2','失败/取消'],['3','过期']]:kind.value==='points'?[['reserved','冻结'],['committed','已入账']]:kind.value==='resources'?[['ready','可用'],['failed','失败'],['processing','处理中']]:kind.value==='orders'?[['pending','待支付'],['paid','已支付'],['manual','人工发放'],['closed','已关闭'],['refunded','已退款'],['refund_review','退款待核对']]:[['success','成功'],['failed','失败'],['processing','处理中']]);
function modeHelp(value:unknown){return value==='cache'?'缓存：下载并持久保存视频、图片，优先存入已启用且可用的云存储；不可用时保存在服务器本地，后续复用已保存的文件。':value==='direct'?'直连：保存平台原始媒体地址，不下载持久保存；视频通过服务器流式转发播放，图片使用源地址。链接可能过期或受平台访问限制。':'未知模式';}
function sourceClass(row:Row){
 if(typeof row.source_label!=='string'||!row.source_label)return undefined;
 const feature=String(row.feature||'');
 const tone=['new_user','signin','ad'].includes(feature)?'reward':['admin_grant','admin_package'].includes(feature)?'manual':feature==='admin_deduct'?'deduct':['parse_share','remove_subtitle','remove_watermark','tts','extract_text','image_repair','image_large'].includes(feature)?'usage':'unknown';
 return ['point-source',`point-source-${tone}`];
}
function changeClass(value:unknown){return ['point-change',Number(value)>0?'point-increase':Number(value)<0?'point-decrease':'point-neutral'];}
function parseStatusType(row:Row):'primary'|'success'|'danger'|'warning'|'info'{
 if(row.cancelled)return 'info';
 const types:Record<string,'primary'|'success'|'danger'|'warning'|'info'>={0:'primary',1:'success',2:'danger',3:'warning',processing:'primary',success:'success',failed:'danger',expired:'warning'};
 return types[String(row.status)]||'info';
}
function platformTagStyle(value:unknown){
 const platform=String(value||'').trim().toLowerCase();
 const hues:Record<string,number>={douyin:215,xiaohongshu:345,kuaishou:25,bilibili:185,youtube:0,weibo:45};
 const hue=hues[platform]??Array.from(platform).reduce((hash,char)=>(hash*31+char.charCodeAt(0))%360,0);
 return {'--el-tag-text-color':`hsl(${hue} 65% 45%)`,'--el-tag-bg-color':`hsl(${hue} 65% 50% / 10%)`,'--el-tag-border-color':`hsl(${hue} 65% 50% / 25%)`};
}
function show(key:string,value:unknown,row:Row={}):string {
 if(key==='platform'){
  const code=String(value||'').trim();
  return platformOptions.find(item=>item.value===code.toLowerCase())?.label.split(' (')[0]||code||'未记录';
 }
 if(key==='amount_fen'){
  if(value===null||value===undefined||value==='')return '—';
  const fen=Number(value);
  return Number.isFinite(fen)?(fen/100).toFixed(2):'—';
 }
 if(key==='share_parse_count')return `成功:${row.share_parse_success_count ?? 0} / 失败:${row.share_parse_failed_count ?? 0}`;
 if(key==='nickname')return value?String(value):'未设置';
 if(['created_at','updated_at'].includes(key))return value?new Date(Number(value)*1000).toLocaleString('zh-CN'):'未知';
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
 if(key==='status'){if(row.cancelled)return '已取消';if(value==='committed'&&row.feature==='admin_deduct')return '扣除成功';return ({'0':'处理中','1':'成功','2':'失败','3':'过期',committed:Number(row.points)<0?'入账/退回':'消费结算',reserved:'冻结',released:'释放',success:'成功',failed:'失败',processing:'处理中',pending:'待处理/支付',paid:'已支付',manual:'人工发放',closed:'已关闭',refunded:'已退款',refund_review:'部分退款待核对',ready:'可用'} as Record<string,string>)[String(value)]||String(value);}
 if(['development','is_valid','cleanup_pending','cancelled'].includes(key))return value===true||Number(value)===1?'是':'否';
 if(key==='scene')return ({parseShareLink:'视频／图集提取',extractTextFromLink:'视频文案提取'} as Record<string,string>)[String(value)]||String(value);
 if(key==='media_type')return ({image:'图片',video:'视频'} as Record<string,string>)[String(value)]||String(value);
 if(key==='output_mode')return ({direct:'直连',cache:'缓存'} as Record<string,string>)[String(value)]||String(value);
 if(key==='upload_status')return ({success:'成功',failed:'失败',pending:'待上传',uploaded:'已上传',local:'本地存储'} as Record<string,string>)[String(value)]||String(value);
 if(key==='source_label')return typeof value==='string'?value:'';
 if(key==='feature')return featureLabel(value);
 if(key==='method')return ({wechat:'微信登录',development:'本地开发登录'} as Record<string,string>)[String(value)]||String(value);
 if(key==='last_login_at')return Number(value)?new Date(Number(value)*1000).toLocaleString('zh-CN'):'—';
 if(key==='order_type')return ({points:'积分充值',membership:'会员开通'} as Record<string,string>)[String(value)]||String(value);
 if(key==='point_change')return `${Number(value)>0?'+':''}${Number(value)}`;
 if(key==='points'){
  // 订单保存到账积分；积分流水则采用正数消费、负数入账的记账约定。
  const change=row.order_type?Number(value):-Number(value);
  return `${change>0?'+':''}${change}`;
 }
 return String(value);
}
async function load(){
 if(!canRead(kind.value))return;
 selected.value=[];busy.value=true;error.value='';
 try{
  const userRanges=kind.value==='users'?{
   created_start:userCreatedDates.value?Math.floor(userCreatedDates.value[0].getTime()/1000):0,
   created_end:userCreatedDates.value?Math.floor(userCreatedDates.value[1].getTime()/1000):0,
   last_login_start:userLoginDates.value?Math.floor(userLoginDates.value[0].getTime()/1000):0,
   last_login_end:userLoginDates.value?Math.floor(userLoginDates.value[1].getTime()/1000):0,
  }:{
   start:dates.value?Math.floor(dates.value[0].getTime()/1000):0,
   end:dates.value?Math.floor(dates.value[1].getTime()/1000):0,
  };
  const params={trashed:kind.value==='parses'&&trashed.value,...Object.fromEntries(Object.entries(filters.value).filter(([,v])=>v!=='')),page:page.value,page_size:size.value,...userRanges};
  if(kind.value==='dashboard')overview.value=await requestClient.get('/operations/dashboard',{params});
  else{const data=await requestClient.get<Result>(`/operations/records/${kind.value}`,{params});rows.value=data.items;total.value=data.total;}
 }catch(e){error.value=e instanceof Error?e.message:'加载失败，请重试';}
 finally{busy.value=false;}
}
function search(){page.value=1;void load();}
type MediaDeleteFailure={id:string;code:number;message:string;files?:MediaDeleteFailure[]};
type MediaDeleteResult={requested:number;deleted:number;deleted_ids:string[];deleted_files:number;failed:MediaDeleteFailure[]};
const mediaDeleteBusy=ref(false),mediaDeleteError=ref('');
const canDeleteMedia=computed(()=>['resources','files'].includes(kind.value)&&access.accessCodes.includes(`${kind.value}:delete`));
async function deleteMedia(name:'resources'|'files',items:Row[],inDialog=false){
 if(mediaDeleteBusy.value||!items.length||!access.accessCodes.includes(`${name}:delete`))return;
 const ids=[...new Set(items.map(row=>String(name==='resources'?row.resource_key:row.id)))];
 if(ids.length>100){ElMessage.warning('每次最多删除100条，请减少选择数量');return;}
 const currentPath=route.fullPath,currentKind=kind.value,currentKey=resourceFilesKey.value,currentVersion=resourceFilesVersion;
 const sameContext=()=>route.fullPath===currentPath&&kind.value===currentKind&&(!inDialog||(resourceFilesOpen.value&&resourceFilesKey.value===currentKey&&resourceFilesVersion===currentVersion));
 mediaDeleteBusy.value=true;mediaDeleteError.value='';
 try{
  await ElMessageBox.confirm(name==='resources'?`确认永久删除选中的 ${ids.length} 个共享资源及其所有批次关联文件？将清理本地和云端托管文件，仍被其他记录引用的实体保留，平台源文件保留。此操作不可撤销。`:`确认永久删除选中的 ${ids.length} 条关联文件及其本地和云端托管文件？仍被引用的实体和平台源文件保留。删除当前有效文件会使资源缓存失效。此操作不可撤销。`,'确认删除',{type:'warning',confirmButtonText:'删除',cancelButtonText:'取消'});
  if(!sameContext()||!access.accessCodes.includes(`${name}:delete`))return;
  const result=await requestClient.post<MediaDeleteResult>(`/operations/${name}/delete`,{ids});
  if(!sameContext())return;
  const summary=`已删除 ${result.deleted} ${name==='resources'?'个资源':'条文件记录'}，清理 ${result.deleted_files} 条关联文件记录`;
  if(result.failed.length){
   mediaDeleteError.value=result.failed.map(item=>`${item.id}：${item.message}${item.files?.length?'；'+item.files.map(file=>`${file.id}：${file.message}`).join('；'):''}`).join('\n');
   ElMessage.warning(`${summary}；${result.failed.length} 项未完成，失败记录已保留，可重试`);
  }else ElMessage.success(summary);
  if(name==='resources'&&result.deleted_ids.includes(String(detail.value.resource_key||'')))visible.value=false;
  if(name==='resources'&&result.deleted_ids.includes(resourceFilesKey.value))resourceFilesOpen.value=false;
  if(inDialog){
   await loadResourceFiles();
   if(!resourceFiles.value.length&&resourceFilesPage.value>1){resourceFilesPage.value--;await loadResourceFiles();}
  }
  if(route.fullPath===currentPath&&kind.value===currentKind){
   await load();
   if(!rows.value.length&&page.value>1){page.value--;await load();}
  }
 }catch(e){if(e!=='cancel'&&e!=='close'&&sameContext()){mediaDeleteError.value=e instanceof Error?e.message:'删除未完成，请刷新核对后重试';ElMessage.error(mediaDeleteError.value);}}
 finally{mediaDeleteBusy.value=false;}
}
watch(()=>route.fullPath,()=>{mediaDeleteError.value='';resourceFilesSelected.value=[];});
async function open(row:Row){try{detailName.value=kind.value;selectedUser.value=kind.value==='users'?String(row.openid):'';detail.value=await requestClient.get(kind.value==='users'?`/operations/users/${encodeURIComponent(String(row.openid))}`:`/operations/records/${kind.value}/${encodeURIComponent(String(row.id||row.resource_key))}`,{params:{trashed:kind.value==='parses'&&trashed.value}});tab.value='';loginDates.value=null;history.value=[];historyPage.value=1;historyTotal.value=0;visible.value=true;}catch(e){ElMessage.error(e instanceof Error?e.message:'详情加载失败');}}
const loginDates=ref<[Date,Date]|null>(null);
const canManageLoginRecords=computed(()=>access.accessCodes.includes('users:login-records:manage'));
const userTabs=computed(()=>[['login_records','登录记录','users:read'],['usage','使用记录','users:read'],['parses','解析记录','parses:read'],['points','积分流水','points:read'],['memberships','会员记录','membership:read'],['logs','管理员操作','users:logs']].filter(v=>access.accessCodes.includes(v[2]!)));
async function historyLoad(){loginRecordSelection.value=[];if(!userTabs.value.some(item=>item[0]===tab.value))return;historyBusy.value=true;try{const url=tab.value==='login_records'?`/operations/users/${encodeURIComponent(selectedUser.value)}/login-records`:tab.value==='logs'?`/operations/users/${encodeURIComponent(selectedUser.value)}/logs`:`/operations/records/${tab.value}`;const data=await requestClient.get<Result>(url,{params:{openid:selectedUser.value,page:historyPage.value,page_size:20,...(tab.value==='login_records'?{start:loginDates.value?Math.floor(loginDates.value[0].getTime()/1000):0,end:loginDates.value?Math.floor(loginDates.value[1].getTime()/1000):0}:{})}});history.value=data.items;historyTotal.value=data.total;}catch(e){ElMessage.error(e instanceof Error?e.message:'加载失败');}finally{historyBusy.value=false;}}
function syncLoginRecordSelection(rows:Row[]){loginRecordSelection.value=tab.value==='login_records'?rows:[];}
async function recheckLoginRecord(row:Row){try{const result=await requestClient.post<{region:string}>('/operations/users/'+encodeURIComponent(selectedUser.value)+'/login-records/'+encodeURIComponent(String(row.id))+'/recheck',{});row.region=result.region;ElMessage.success('归属地已更新：'+result.region);await historyLoad();detail.value=await requestClient.get('/operations/users/'+encodeURIComponent(selectedUser.value));}catch(e){ElMessage.error(e instanceof Error?e.message:'归属地补查失败');}}
async function deleteSelectedLoginRecords(){const ids=loginRecordSelection.value.map(row=>String(row.id));if(!ids.length)return;try{await ElMessageBox.confirm('将删除当前选中的 '+ids.length+' 条登录记录，此操作不可撤销。','确认删除登录记录',{type:'warning',confirmButtonText:'删除',cancelButtonText:'取消'});const result=await requestClient.post<{deleted:number}>('/operations/users/'+encodeURIComponent(selectedUser.value)+'/login-records/delete',{ids});ElMessage.success('已删除 '+result.deleted+' 条登录记录');if(history.value.length<=result.deleted&&historyPage.value>1)historyPage.value--;await historyLoad();}catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(e instanceof Error?e.message:'删除失败');}}async function operate(row:Row,action:'retry'|'cancel'){let max_points=0;try{if(action==='retry'){const q=await requestClient.get<{points:number;availablePoints:number;memberCovered:boolean}>(`/operations/tasks/${kind.value}/${row.id}/quote`);max_points=q.points;await ElMessageBox.confirm(`本次预计扣除 ${q.points} 积分，可用 ${q.availablePoints} 积分${q.memberCovered?'，会员权益覆盖':''}。确认重新排队？`,'重试费用确认',{type:'warning'});}else await ElMessageBox.confirm('取消将协作停止任务并释放冻结额度，保留记录和原视频。确认取消？','取消任务',{type:'warning'});const {value}=await ElMessageBox.prompt('请输入操作原因','操作原因',{inputValidator:v=>!!v?.trim()||'请填写原因'});busy.value=true;await requestClient.post(`/operations/tasks/${kind.value}/${row.id}/${action}`,{max_points,reason:value});ElMessage.success('操作成功');await load();}catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(e instanceof Error?e.message:'操作未完成，请刷新核对');}finally{busy.value=false;}}
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
function openParseDelete(items:Row[]){if(!items.length)return;parseDeleteItems.value=items.slice();parseDeleteOpen.value=true;}
async function changeRecycle(action:'delete'|'restore',items:Row[],confirmed=false){
 if(recycleSaving.value||!items.length)return;
 const ids=items.map(row=>String(row.id));
 try{
  if(!confirmed)await ElMessageBox.confirm(action==='delete'?'确认将 '+ids.length+' 条解析记录移入回收站？视频和图片文件会保留。':'确认恢复 '+ids.length+' 条解析记录？',action==='delete'?'删除解析记录':'恢复解析记录',{type:'warning'});
  recycleSaving.value=true;
  const result=await requestClient.post<{changed:number}>('/operations/parses/'+action,{ids});
  ElMessage.success(action==='delete'?'已将 '+result.changed+' 条记录移入回收站':'已恢复 '+result.changed+' 条记录');
  if(action==='delete'){parseDeleteOpen.value=false;parseDeleteItems.value=[];}
  selected.value=[];visible.value=false;await load();
  if(!rows.value.length&&page.value>1){page.value-=1;await load();}
 }catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(e instanceof Error?e.message:'操作失败，请刷新重试');}
 finally{recycleSaving.value=false;}
}
async function purgeParseRecords(items:Row[],confirmed=false){
 if(recycleSaving.value||!items.length||!canPurge.value)return;
 const ids=items.map(row=>String(row.id));
 try{
  if(!confirmed)await ElMessageBox.confirm('直接删除 '+ids.length+' 条解析记录后不可恢复；关联的视频、图片和共享媒体资源会保留。','直接删除解析记录',{type:'error',confirmButtonText:'直接删除',cancelButtonText:'取消'});
  recycleSaving.value=true;
  const result=await requestClient.post<{deleted:number;requested:number}>('/operations/parses/purge',{ids});
  ElMessage.success('已直接删除 '+result.deleted+' 条解析记录，关联媒体资源保留');
  parseDeleteOpen.value=false;parseDeleteItems.value=[];selected.value=[];visible.value=false;await load();
  if(!rows.value.length&&page.value>1){page.value-=1;await load();}
 }catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(e instanceof Error?e.message:'直接删除失败，请刷新重试');}
 finally{recycleSaving.value=false;}
}
async function submitParseDelete(action:'delete'|'purge'){const items=parseDeleteItems.value.slice();if(action==='delete')await changeRecycle('delete',items,true);else await purgeParseRecords(items,true);}

function toggleRecycle(){trashed.value=!trashed.value;page.value=1;selected.value=[];void load();}
watch(resource,()=>{kind.value=resource.value;},{immediate:true});
watch(kind,()=>{trashed.value=false;selected.value=[];page.value=1;rows.value=[];visible.value=false;userCreatedDates.value=null;userLoginDates.value=null;filters.value={openid:'',nickname:'',status:'',platform:'',output_mode:'',run_id:'',resource_key:String(route.query.resource_key||''),feature:'',is_valid:''};void load();},{immediate:true});
</script>
<template>
<Page :title="String(route.meta.title)" description="运营记录与任务管理">
<ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-4" />
<ElAlert v-if="mediaDeleteError" :title="mediaDeleteError" type="warning" :closable="false" class="mb-4 whitespace-pre-wrap break-all" />
<ElTabs v-if="resource==='parses'" v-model="kind" class="mb-4" :before-leave="()=>!recycleSaving">
<ElTabPane v-for="c in choices" :key="c[0]" :name="c[0]!" :label="c[1]" />
</ElTabs>
<div class="mb-4 flex flex-wrap gap-3">
<ElSelect v-if="resource!=='parses'&&choices.length>1" v-model="kind" style="width:180px"><ElOption v-for="c in choices" :key="c[0]" :value="c[0]!" :label="c[1]" /></ElSelect>
<ElInput v-if="!['dashboard','resources','files'].includes(kind)" v-model="filters.openid" placeholder="完整 OpenId" clearable style="width:240px" @keyup.enter="search" />
<ElInput v-if="kind==='users'" v-model="filters.nickname" placeholder="昵称关键字" clearable style="width:180px" @keyup.enter="search" />
<ElSelect v-if="['subtitle','watermark','points','orders','parses','resources'].includes(kind)" v-model="filters.status" clearable placeholder="全部状态" style="width:150px"><ElOption v-for="s in statusOptions" :key="s[0]" :value="s[0]!" :label="s[1]" /></ElSelect>
<ElSelect v-if="['parses','resources'].includes(kind)" v-model="filters.platform" filterable allow-create default-first-option clearable placeholder="输入或选择平台" style="width:200px" @change="normalizePlatformFilter"><ElOption v-for="platform in platformOptions" :key="platform.value" :label="platform.label" :value="platform.value" /></ElSelect>
<template v-if="['resources','files'].includes(kind)"><ElInput v-model="filters.resource_key" placeholder="资源标识" clearable style="width:220px" /><ElInput v-model="filters.run_id" placeholder="批次" clearable style="width:170px" /><ElInput v-model="filters.output_mode" placeholder="模式" clearable style="width:120px" /></template>
<ElSelect v-if="kind==='files'" v-model="filters.is_valid" clearable placeholder="有效状态" style="width:130px"><ElOption label="有效" value="1" /><ElOption label="失效" value="0" /></ElSelect>
<template v-if="kind==='users'"><AppDatePicker v-model="userCreatedDates" type="datetimerange" format="YYYY-MM-DD HH:mm" style="width:300px;max-width:100%;flex:none" start-placeholder="创建开始时间" end-placeholder="创建结束时间" /><AppDatePicker v-model="userLoginDates" type="datetimerange" format="YYYY-MM-DD HH:mm" style="width:300px;max-width:100%;flex:none" start-placeholder="登录开始时间" end-placeholder="登录结束时间" /></template>
<AppDatePicker v-if="kind!=='users'" v-model="dates" type="datetimerange" start-placeholder="开始时间" end-placeholder="结束时间" />
<ElButton :loading="busy" type="primary" @click="search">查询</ElButton>

<ElButton v-if="canDeleteMedia" type="danger" plain :disabled="!selected.length||busy" :loading="mediaDeleteBusy" @click="deleteMedia(kind as 'resources'|'files',selected)">删除所选（{{selected.length}}）</ElButton>
<template v-if="kind==='parses'"><ElButton :disabled="busy||recycleSaving" @click="toggleRecycle">{{trashed?'返回解析记录':'回收站'}}</ElButton><ElButton v-if="!trashed&&(canRecycle||canPurge)" type="danger" :disabled="!selected.length||busy" :loading="recycleSaving" @click="openParseDelete(selected)">批量删除（{{selected.length}}）</ElButton><ElButton v-if="trashed&&canRecycle" type="primary" :disabled="!selected.length||busy" :loading="recycleSaving" @click="changeRecycle('restore',selected)">批量恢复（{{selected.length}}）</ElButton><ElButton v-if="trashed&&canPurge" type="danger" plain :disabled="!selected.length||busy" :loading="recycleSaving" @click="purgeParseRecords(selected)">批量直接删除（{{selected.length}}）</ElButton></template>
</div>
<template v-if="kind==='dashboard'">
 <ElAlert title="除累计用户数外，各项指标按对应记录的创建时间筛选；结果记录与任务记录的创建时间可能不同。" type="info" :closable="false" class="mb-4" />
 <div v-loading="busy" class="overview-groups">
  <ElCard v-for="group in overviewGroups" :key="group.id" shadow="never" class="overview-group" :class="{'overview-group-wide':['general','transcripts'].includes(group.id)}">
   <template #header><h3 class="overview-group-title">{{group.title}}</h3></template>
   <p class="overview-group-description">{{group.description}}</p>
   <template v-if="group.id==='transcripts'">
    <div class="overview-transcript-total">
     <div class="overview-metric-label">文案提取总成功次数</div>
     <div class="overview-metric-value">{{overview.transcript_success??'暂无数据'}}</div>
     <div class="overview-transcript-parts">
      <span>其中：链接 <strong>{{overview.transcript_url_success??'—'}}</strong> 次</span>
      <span>上传 <strong>{{overview.transcript_upload_success??'—'}}</strong> 次</span>
     </div>
    </div>
    <div class="overview-metrics">
     <div v-for="key in ['text_task_completed','text_task_success_rate']" :key="key" class="overview-metric">
      <div class="overview-metric-label">{{labels[key]}}</div>
      <div class="overview-metric-value">{{overview[key]??'暂无数据'}}</div>
     </div>
    </div>
   </template>
   <div v-else class="overview-metrics" :class="{'overview-metrics-three':group.metrics.length>2}">
    <div v-for="key in group.metrics" :key="key" class="overview-metric">
     <div class="overview-metric-label">{{labels[key]}}</div>
     <div class="overview-metric-value">{{overview[key]??'暂无数据'}}</div>
    </div>
   </div>
  </ElCard>
 </div>
</template>
<ElCard v-else><ElPagination v-if="kind==='users'" v-model:current-page="page" v-model:page-size="size" class="mb-4" :total="total" :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next, jumper, slot" @current-change="load" @size-change="search" style="justify-content:center;flex-wrap:wrap;row-gap:8px"><ElButton size="small" :disabled="page<=1" @click="page=1;load()">首页</ElButton><ElButton size="small" :disabled="page>=Math.max(1,Math.ceil((total)/(size)))" @click="page=Math.max(1,Math.ceil((total)/(size)));load()">末页</ElButton></ElPagination><ElAlert v-if="kind==='points'" title="余额为该笔操作发生时的总积分（含冻结部分）；历史流水未记录余额时显示 —。冻结、释放的总积分变动为 0。" type="info" :closable="false" class="mb-4" /><ElAlert v-if="kind==='parses'&&trashed" title="回收站：记录可恢复或直接删除；关联视频和图片未删除。" type="info" :closable="false" class="mb-4" /><ElTable v-loading="busy||recycleSaving" :data="rows" :row-key="(row:Row)=>String(row.id||row.resource_key||row.openid)" stripe border empty-text="暂无记录" @selection-change="selected=$event"><ElTableColumn v-if="(kind==='parses'&&(canRecycle||canPurge))||canDeleteMedia" type="selection" width="48" fixed="left" /><ElTableColumn v-if="['users','orders','points','memberships','parses','subtitle','watermark'].includes(kind)" label="头像" width="80"><template #default="{row}"><ElAvatar :size="44" :src="String(row.avatar_url||'')">用户</ElAvatar></template></ElTableColumn><ElTableColumn v-if="kind==='files'" label="预览" width="130"><template #default="s"><MediaFilePreview :file="s.row" compact /></template></ElTableColumn><ElTableColumn v-for="key in columns" :key="key" :label="labels[key]" :width="kind==='parses'&&parseColumnWidths[key]?parseColumnWidths[key]:key==='ledger_user_info'?340:undefined" :min-width="kind==='parses'&&parseColumnWidths[key]?parseColumnWidths[key]:['share_text','source_url'].includes(key)?360:key==='ledger_user_info'?340:key==='user_info'?360:key==='ip_info'?220:key==='member_info'||key==='time_info'?210:key==='share_parse_count'?210:key==='openid'||key==='error'?220:150" :show-overflow-tooltip="!['ledger_user_info','user_info','ip_info','member_info','time_info'].includes(key)"><template #header><ElTooltip v-if="key==='share_parse_count'" content="分别统计分享链接解析成功与失败次数，含回收站记录，不含处理中和文案提取" placement="top"><span class="cursor-help">{{labels[key]}} ⓘ</span></ElTooltip><ElTooltip v-else-if="key==='output_mode'" placement="top"><template #content><div style="max-width:360px;line-height:1.7"><p>{{modeHelp('cache')}}</p><p class="mt-2">{{modeHelp('direct')}}</p></div></template><span class="cursor-help" tabindex="0">{{labels[key]}} ⓘ</span></ElTooltip><span v-else>{{labels[key]}}</span></template><template #default="s"><div v-if="key==='ledger_user_info'" class="ledger-user-info"><CopyValue :value="s.row.openid" label="复制用户 OpenId" /><span class="ledger-user-nickname" :title="show('nickname',s.row.nickname)">{{show('nickname',s.row.nickname)}}</span></div><div v-else-if="key==='user_info'" class="user-info-lines">
<div><span class="user-info-label">OpenId：</span><CopyValue class="user-info-value" :value="s.row.openid" label="复制用户 OpenId" /></div>
<div><span class="user-info-label">昵称：</span><span class="user-info-value user-info-ellipsis" :title="show('nickname',s.row.nickname)">{{show('nickname',s.row.nickname)}}</span></div>
<div><span class="user-info-label">积分余额：</span><span class="user-stat user-stat-balance">{{s.row.balance ?? 0}}</span></div>
<div><span class="user-info-label">开发者账号：</span><ElSwitch :model-value="s.row.development===true||Number(s.row.development)===1" active-text="是" inactive-text="否" inline-prompt :loading="developmentSaving[String(s.row.openid)]" :disabled="busy||!access.accessCodes.includes('users:development')" :before-change="()=>toggleDevelopment(s.row)" aria-label="开发者账号" /></div>
</div><div v-else-if="key==='ip_info'" class="user-info-lines">
<div><span class="user-info-label">注册 IP：</span><CopyValue :value="s.row.register_ip" label="复制注册 IP" /></div>
<div class="user-info-ellipsis" :title="String(s.row.register_region||'未知')"><span class="user-info-label">注册地区：</span>{{s.row.register_region||'未知'}}</div>
<div><span class="user-info-label">最新 IP：</span><CopyValue :value="s.row.last_login_ip" label="复制最新登录 IP"><ElButton v-if="s.row.last_login_ip" link type="primary" title="查看登录历史" style="white-space:normal;overflow-wrap:anywhere;height:auto;text-align:left" @click="openLoginHistory(s.row)">{{s.row.last_login_ip}}</ElButton><span v-else>—</span></CopyValue></div>
<div class="user-info-ellipsis" :title="String(s.row.last_login_region||'未知')"><span class="user-info-label">最新地区：</span>{{s.row.last_login_region||'未知'}}</div>
</div><div v-else-if="key==='member_info'" class="user-info-lines">
<div><span class="user-info-label">状态：</span><ElTag class="user-member-tag" :effect="s.row.is_vip?'dark':'light'" :type="s.row.is_vip?'warning':'info'">{{show('is_vip',s.row.is_vip,s.row)}}</ElTag></div>
<div><span class="user-info-label">套餐：</span><span class="user-info-value user-info-ellipsis" :title="show('plan_name',s.row.plan_name)">{{show('plan_name',s.row.plan_name)}}</span></div>
<div><span class="user-info-label">到期：</span><span>{{show('expires',s.row.expires,s.row)}}</span></div>
</div><div v-else-if="key==='time_info'" class="user-info-lines">
<div><span class="user-info-label">创建：</span><span>{{show('created_at',s.row.created_at)}}</span></div>
<div><span class="user-info-label">登录：</span><span>{{show('last_login_at',s.row.last_login_at)}}</span></div>
<div><span class="user-info-label">更新：</span><span>{{show('updated_at',s.row.updated_at)}}</span></div>
</div><ElTag v-else-if="key==='is_vip'" class="user-member-tag" :effect="s.row.is_vip?'dark':'light'" :type="s.row.is_vip?'warning':'info'">{{show(key,s.row[key],s.row)}}</ElTag><ElTag v-else-if="key==='output_mode'||key==='status'||key==='is_valid'" :type="kind==='parses'&&key==='status'?parseStatusType(s.row):undefined" :size="kind==='parses'?'small':undefined" :class="{'parse-status-tag':kind==='parses'}">{{show(key,s.row[key],s.row)}}</ElTag><span v-else-if="kind==='users'&&['share_parse_count','balance'].includes(key)" class="user-stat" :class="key==='balance'?'user-stat-balance':'user-stat-parses'">{{show(key,s.row[key],s.row)}}</span><CopyValue v-else-if="kind==='resources'&&key==='resource_key'" :value="s.row.resource_key" label="复制资源标识"><ElButton v-if="canRead('files')" link type="primary" style="white-space:normal;overflow-wrap:anywhere;height:auto" @click="openResourceFiles(s.row)">{{s.row.resource_key}}</ElButton><span v-else>{{s.row.resource_key}}</span></CopyValue><div v-else-if="kind==='parses'&&key==='share_text'" class="flex flex-col items-start gap-1"><CopyValue :value="s.row.share_text" label="复制原始分享内容" /><ElButton v-if="canRead('resources')" link type="primary" :disabled="!s.row.share_text" @click.stop="openParseResources(s.row)">查看共享资源</ElButton></div><CopyValue v-else-if="['source_url','object_url','object_key','audio_url','share_text'].includes(key)" :value="s.row[key]" :label="'复制'+labels[key]" /><div v-else-if="key==='points'&&s.row.order_type" class="order-point-lines"><span>{{show(key,s.row[key],s.row)}}</span><span class="order-point-balance">变动后余额：{{show('balance_after',s.row.balance_after)}}</span></div><ElTag v-else-if="kind==='parses'&&key==='scene'" size="small" class="parse-scene-tag" :type="s.row.scene==='parseShareLink'?'primary':s.row.scene==='extractTextFromLink'?'success':'info'">{{show(key,s.row[key],s.row)}}</ElTag><ElTag v-else-if="kind==='parses'&&key==='platform'" size="small" class="parse-platform-tag" :style="platformTagStyle(s.row.platform)">{{show(key,s.row[key],s.row)}}</ElTag><CopyValue v-else-if="key==='openid'" :value="s.row.openid" label="复制用户 OpenId" /><span v-else :class="key==='balance_after'?'point-balance':key==='point_change'?changeClass(s.row[key]):key==='source_label'?sourceClass(s.row):undefined">{{show(key,s.row[key],s.row)}}</span></template></ElTableColumn><ElTableColumn label="操作" fixed="right" :width="kind==='users'?270:task?260:kind==='parses'&&trashed?240:180"><template #default="s"><ElButton link type="primary" @click="open(s.row)">详情</ElButton><ElButton v-if="kind==='users'&&access.accessCodes.includes('points:read')" link type="primary" @click="openUserPoints(s.row)">积分流水</ElButton><ElButton v-if="kind==='users'&&access.accessCodes.includes('users:delete')" link type="danger" :disabled="busy||deletionSaving" @click="openUserDeletion(s.row)">删除用户</ElButton><ElButton v-if="canDeleteMedia" link type="danger" :disabled="busy||mediaDeleteBusy" @click="deleteMedia(kind as 'resources'|'files',[s.row])">删除</ElButton><ElButton v-if="kind==='parses'&&trashed&&canRecycle" link type="primary" :disabled="busy||recycleSaving" @click="changeRecycle('restore',[s.row])">恢复</ElButton><ElButton v-if="kind==='parses'&&trashed&&canPurge" link type="danger" :disabled="busy||recycleSaving" @click="purgeParseRecords([s.row])">直接删除</ElButton><ElButton v-if="kind==='parses'&&!trashed&&(canRecycle||canPurge)" link type="danger" :disabled="busy||recycleSaving" @click="openParseDelete([s.row])">删除</ElButton><template v-if="task"><ElButton v-if="access.accessCodes.includes(`${kind}:retry`)" link :disabled="busy||Number(s.row.status)!==2" @click="operate(s.row,'retry')">重试</ElButton><ElButton v-if="access.accessCodes.includes(`${kind}:cancel`)" link type="danger" :disabled="busy||Number(s.row.status)!==0" @click="operate(s.row,'cancel')">取消</ElButton></template><ElDropdown v-if="kind==='users'&&['points:grant','points:deduct','membership:grant'].some(code=>access.accessCodes.includes(code))" trigger="click" class="ml-3" :disabled="saving">
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
   <ElTableColumn label="头像" width="80"><template #default="{row}"><ElAvatar :size="44" :src="String(row.avatar_url||'')">用户</ElAvatar></template></ElTableColumn>
   <ElTableColumn label="用户 OpenId" width="260"><template #default="{row}"><CopyValue :value="row.openid" label="复制用户 OpenId" /></template></ElTableColumn><ElTableColumn label="昵称" width="120" show-overflow-tooltip><template #default="{row}">{{show('nickname',row.nickname)}}</template></ElTableColumn>
   <ElTableColumn v-for="field in ['source_label','balance_before','point_change','balance_after','created']" :key="field" :label="field==='source_label'?'积分来源／用途':labels[field]" :min-width="field==='created'?180:field==='source_label'?180:120"><template #default="{row}"><span :class="field==='balance_after'?'point-balance':field==='point_change'?changeClass(row[field]):field==='source_label'?sourceClass(row):undefined">{{show(field,row[field],row)}}</span></template></ElTableColumn>
  </ElTable>
  <ElPagination v-model:current-page="pointsPage" :total="pointsTotal" :page-size="20" layout="total, prev, pager, next, jumper, slot" class="mt-3" @current-change="loadUserPoints" style="justify-content:center;flex-wrap:wrap;row-gap:8px"><ElButton size="small" :disabled="pointsPage<=1" @click="pointsPage=1;loadUserPoints()">首页</ElButton><ElButton size="small" :disabled="pointsPage>=Math.max(1,Math.ceil((pointsTotal)/(20)))" @click="pointsPage=Math.max(1,Math.ceil((pointsTotal)/(20)));loadUserPoints()">末页</ElButton></ElPagination>
 </template>
</ElDialog>
<ElDialog v-model="parseResourcesOpen" title="共享资源列表" width="min(1400px,96vw)" append-to-body destroy-on-close>
 <template v-if="parseResourcesOpen">
  <div class="mb-3 whitespace-pre-wrap break-all"><strong>原始分享内容：</strong><CopyValue :value="parseResourcesShare" label="复制原始分享内容" /></div>
  <ElAlert v-if="parseResourcesError" :title="parseResourcesError" type="error" :closable="false" class="mb-3" />
  <ElAlert v-else :title="parseResourcesNote||'正在查询匹配的共享资源…'" type="info" :closable="false" class="mb-3" />
  <ElTable v-loading="parseResourcesBusy" :data="parseResources" row-key="resource_key" border empty-text="暂无匹配的共享资源">
   <ElTableColumn label="资源标识" min-width="280"><template #default="{row}"><CopyValue :value="row.resource_key" label="复制资源标识" /></template></ElTableColumn>
   <ElTableColumn v-for="field in ['platform','output_mode','status','run_id','updated']" :key="field" :label="labels[field]" :min-width="field==='run_id'?260:140"><template #default="{row}">{{show(field,row[field],row)}}</template></ElTableColumn>
   <ElTableColumn label="完整分享链接" min-width="280"><template #default="{row}"><CopyValue :value="row.source_url" label="复制完整分享链接" /></template></ElTableColumn>
   <ElTableColumn v-if="canRead('files')" label="操作" width="140" fixed="right"><template #default="{row}"><ElButton link type="primary" @click="openResourceFiles(row)">查看关联文件</ElButton></template></ElTableColumn>
  </ElTable>
 </template>
</ElDialog>
<ElDialog v-model="resourceFilesOpen" title="资源关联文件" width="min(1400px,96vw)" append-to-body destroy-on-close>
 <template v-if="resourceFilesOpen">
  <div class="mb-3">资源标识：<CopyValue :value="resourceFilesKey" label="复制资源标识" /></div>
  <ElAlert v-if="resourceFilesError" :title="resourceFilesError" type="error" class="mb-3"/>
  <ElButton class="mb-3" :loading="resourceFilesBusy" @click="loadResourceFiles">刷新</ElButton>
  <ElButton v-if="access.accessCodes.includes('files:delete')" class="mb-3 ml-2" type="danger" plain :disabled="!resourceFilesSelected.length||resourceFilesBusy" :loading="mediaDeleteBusy" @click="deleteMedia('files',resourceFilesSelected,true)">删除所选（{{resourceFilesSelected.length}}）</ElButton>
  <ElAlert v-if="mediaDeleteError" :title="mediaDeleteError" type="warning" :closable="false" class="mb-3 whitespace-pre-wrap break-all" />
  <ElCard shadow="never" class="mb-3"><template #header><strong>视频文案</strong></template><div v-loading="resourceFilesBusy" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto"><CopyValue :value="resourceCaption" label="复制视频文案">{{resourceCaption || (resourceFilesBusy?'加载中…':'暂无视频文案')}}</CopyValue></div></ElCard>
  <ElTable v-loading="resourceFilesBusy" :data="resourceFiles" row-key="id" border empty-text="暂无关联文件" @selection-change="resourceFilesSelected=$event">
   <ElTableColumn v-if="access.accessCodes.includes('files:delete')" type="selection" width="48" />
   <ElTableColumn label="预览" width="130"><template #default="{row}"><MediaFilePreview :file="row" compact/></template></ElTableColumn>
   <ElTableColumn v-for="field in ['media_type','is_valid','upload_status','output_mode','run_id','file_size']" :key="field" :label="labels[field]" min-width="130"><template #default="{row}">{{show(field,row[field],row)}}</template></ElTableColumn>
   <ElTableColumn label="文件地址" min-width="260"><template #default="{row}"><CopyValue :value="row.object_url" label="复制文件地址"/></template></ElTableColumn>
   <ElTableColumn v-if="access.accessCodes.includes('files:delete')" label="操作" width="90" fixed="right"><template #default="{row}"><ElButton link type="danger" :disabled="resourceFilesBusy||mediaDeleteBusy" @click="deleteMedia('files',[row],true)">删除</ElButton></template></ElTableColumn>
  </ElTable>
  <ElPagination v-model:current-page="resourceFilesPage" :total="resourceFilesTotal" :page-size="20" layout="total, prev, pager, next, jumper, slot" class="mt-3" @current-change="loadResourceFiles" style="justify-content:center;flex-wrap:wrap;row-gap:8px"><ElButton size="small" :disabled="resourceFilesPage<=1" @click="resourceFilesPage=1;loadResourceFiles()">首页</ElButton><ElButton size="small" :disabled="resourceFilesPage>=Math.max(1,Math.ceil((resourceFilesTotal)/(20)))" @click="resourceFilesPage=Math.max(1,Math.ceil((resourceFilesTotal)/(20)));loadResourceFiles()">末页</ElButton></ElPagination>
 </template>
</ElDialog>
<ElDialog v-model="visible" title="记录详情" width="85%"><div v-if="visible&&detailName==='files'" class="mb-4"><MediaFilePreview :file="detail" /></div><ElDescriptions :column="2" border><ElDescriptionsItem v-for="(value,key) in detailFields" :key="key" :label="detailName==='users'&&key==='plan_name'?'有效会员':detailName==='users'&&key==='expires'?'会员到期':labels[key]||String(key)"><CopyValue v-if="['register_ip','last_login_ip','source_url','object_url','object_key','audio_url','video_url','image_url','input_path','output_path'].includes(String(key))" :value="value" :label="'复制'+(labels[key]||String(key))" /><span v-else :class="key==='balance_after'?'point-balance':key==='point_change'?changeClass(value):key==='source_label'?sourceClass(detail):undefined">{{show(String(key),value,detail)}}</span></ElDescriptionsItem></ElDescriptions>
<ParseDetail v-if="['parses','resources'].includes(detailName)" :detail="detail" :can-resources="canRead('resources')" :can-files="canRead('files')" /><ElButton v-if="detailName==='resources'&&canRead('files')" class="mt-4" @click="openResourceFiles(detail)">查看关联文件</ElButton><template v-if="selectedUser"><div class="my-4 flex gap-2"><ElButton v-for="t in userTabs" :key="t[0]" :type="tab===t[0]?'primary':'default'" @click="tab=t[0]!;historyPage=1;historyLoad()">{{t[1]}}</ElButton></div><div v-if="tab==='login_records'" class="mb-4"><AppDatePicker v-model="loginDates" type="datetimerange" start-placeholder="登录开始时间" end-placeholder="登录结束时间" @change="historyPage=1;historyLoad()" /></div><div v-if="tab==='login_records'&&canManageLoginRecords" class="mb-4"><ElButton type="danger" plain :disabled="!loginRecordSelection.length" @click="deleteSelectedLoginRecords">删除所选{{loginRecordSelection.length?' ('+loginRecordSelection.length+')':''}}</ElButton></div><ElTable v-if="tab" v-loading="historyBusy" :data="history" border empty-text="暂无记录" @selection-change="syncLoginRecordSelection"><ElTableColumn v-if="tab==='login_records'&&canManageLoginRecords" type="selection" width="48" /><ElTableColumn v-if="['points','memberships','parses','subtitle','watermark'].includes(tab)" label="头像" width="80"><template #default="{row}"><ElAvatar :size="44" :src="String(row.avatar_url||'')">用户</ElAvatar></template></ElTableColumn><ElTableColumn v-for="key in columnMap[tab]" :key="key" :label="labels[key]" :width="key==='ledger_user_info'?340:undefined" :min-width="key==='share_text'?360:160" :show-overflow-tooltip="key!=='share_text'"><template #default="s"><div v-if="key==='ledger_user_info'" class="ledger-user-info"><CopyValue :value="s.row.openid" label="复制用户 OpenId" /><span class="ledger-user-nickname" :title="show('nickname',s.row.nickname)">{{show('nickname',s.row.nickname)}}</span></div><CopyValue v-else-if="tab==='login_records'&&key==='ip'" :value="s.row.ip" label="复制登录 IP" /><div v-else-if="tab==='parses'&&key==='share_text'" class="flex flex-col items-start gap-1"><CopyValue class="history-share-copy" :value="s.row.share_text" label="复制原始分享内容"><ElTooltip placement="right-start" :offset="16" :show-after="350" :hide-after="0" :enterable="false" :disabled="!s.row.share_text"><template #content><div style="max-width:360px;max-height:180px;overflow:auto;white-space:normal;overflow-wrap:anywhere;line-height:1.6">{{s.row.share_text}}</div></template><span class="history-share-text">{{show(key,s.row[key],s.row)}}</span></ElTooltip></CopyValue><ElButton v-if="canRead('resources')" link type="primary" :disabled="!s.row.share_text" @click.stop="openParseResources(s.row,true)">查看共享资源</ElButton></div><div v-else-if="key==='points'&&s.row.order_type" class="order-point-lines"><span>{{show(key,s.row[key],s.row)}}</span><span class="order-point-balance">变动后余额：{{show('balance_after',s.row.balance_after)}}</span></div><CopyValue v-else-if="key==='openid'" :value="s.row.openid" label="复制用户 OpenId" /><span v-else :class="key==='balance_after'?'point-balance':key==='point_change'?changeClass(s.row[key]):key==='source_label'?sourceClass(s.row):undefined">{{show(key,s.row[key],s.row)}}</span></template></ElTableColumn><ElTableColumn v-if="tab==='login_records'&&canManageLoginRecords" label="操作" width="120" fixed="right"><template #default="{row}"><ElButton link type="primary" :disabled="!row.ip" @click="recheckLoginRecord(row)">补查归属地</ElButton></template></ElTableColumn></ElTable><ElPagination v-if="tab" v-model:current-page="historyPage" :total="historyTotal" :page-size="20" layout="total, prev, pager, next, jumper, slot" @current-change="historyLoad" style="justify-content:center;flex-wrap:wrap;row-gap:8px"><ElButton size="small" :disabled="historyPage<=1" @click="historyPage=1;historyLoad()">首页</ElButton><ElButton size="small" :disabled="historyPage>=Math.max(1,Math.ceil((historyTotal)/(20)))" @click="historyPage=Math.max(1,Math.ceil((historyTotal)/(20)));historyLoad()">末页</ElButton></ElPagination></template></ElDialog>
<ElDialog v-model="deletionOpen" title="永久删除单个用户" width="680px" :close-on-click-modal="false" :close-on-press-escape="!deletionSaving" :show-close="!deletionSaving">
<ElAlert title="删除后不可恢复。用户再次访问小程序会重新注册，并可能再次获得新人奖励。" type="error" :closable="false" class="mb-4" />
<ElAlert title="保留共享媒体资源、管理员账号和本次删除审计；仅删除当前用户及其私有数据，不支持批量删除。" type="warning" :closable="false" class="mb-4" />
<ElForm label-position="top" :disabled="deletionSaving"><ElFormItem label="待删除用户 OpenID"><CopyValue :value="deletionOwner" label="复制待删除用户 OpenID" /></ElFormItem></ElForm>
<ElAlert v-if="deletionError" :title="deletionError" type="error" :closable="false" class="mb-4" />
<div v-loading="deletionBusy" style="min-height:48px">
<template v-if="deletionPreview"><ElDescriptions title="预计删除范围" :column="2" border><ElDescriptionsItem v-for="(count,name) in deletionPreview.tables" :key="name" :label="deletionTableLabels[name]||String(name)">{{count}} 条</ElDescriptionsItem><ElDescriptionsItem label="私有本地文件">{{deletionPreview.private_local_files}} 个</ElDescriptionsItem><ElDescriptionsItem label="云存储文件">{{deletionPreview.cloud_files}} 个</ElDescriptionsItem></ElDescriptions>
<ElAlert v-for="blocker in deletionPreview.blockers" :key="blocker" :title="blocker" type="error" :closable="false" class="mt-3" /><ElAlert v-if="!deletionPreview.can_delete&&!deletionPreview.blockers.length" title="当前状态不允许删除，请刷新预览后核对。" type="error" :closable="false" class="mt-3" /></template></div>
<ElForm class="mt-4" label-position="top" :disabled="deletionSaving"><ElFormItem label="再次完整输入上方 OpenID 确认删除"><ElInput v-model="deletionConfirm" autocomplete="off" placeholder="必须与上方 OpenID 完全一致" /></ElFormItem><ElFormItem label="删除原因（必填，最多 200 字）"><ElInput v-model="deletionReason" type="textarea" maxlength="200" show-word-limit /></ElFormItem></ElForm>
<template #footer><ElButton :disabled="deletionSaving" @click="deletionOpen=false">取消</ElButton><ElButton :loading="deletionBusy" :disabled="deletionSaving" @click="loadDeletionPreview">刷新预览</ElButton><ElButton type="danger" :loading="deletionSaving" :disabled="!canDeleteUser" @click="submitUserDeletion">永久删除该用户</ElButton></template>
</ElDialog>
<ElDialog v-model="parseDeleteOpen" title="删除解析记录" width="540px" :close-on-click-modal="!recycleSaving" :close-on-press-escape="!recycleSaving" :show-close="!recycleSaving">
 <ElAlert title="移入回收站后可恢复；直接删除不可恢复，仅移除解析记录，关联的视频、图片和共享媒体资源会保留。" type="warning" :closable="false" class="mb-4" />
 <ElDescriptions :column="1" border><ElDescriptionsItem label="待处理记录">{{parseDeleteItems.length}} 条</ElDescriptionsItem></ElDescriptions>
 <template #footer><ElButton :disabled="recycleSaving" @click="parseDeleteOpen=false">取消</ElButton><ElButton v-if="canRecycle" type="warning" :loading="recycleSaving" :disabled="!parseDeleteItems.length" @click="submitParseDelete('delete')">移入回收站</ElButton><ElButton v-if="canPurge" type="danger" :loading="recycleSaving" :disabled="!parseDeleteItems.length" @click="submitParseDelete('purge')">直接删除</ElButton></template>
 </ElDialog>
<ElDialog v-model="granting" :title="grantType==='membership'?'开通／续费会员（不代表微信支付）':'人工发放积分'" width="520px"><ElForm label-position="top"><ElFormItem label="用户"><ElInput v-model="grant.openid" disabled /></ElFormItem><ElFormItem v-if="grantType==='points'" label="积分"><ElInputNumber v-model="grant.points" :min="0" :precision="0" /></ElFormItem><ElFormItem v-else label="会员套餐"><ElSelect v-model="grant.plan"><ElOption v-for="p in plans" :key="String(p.code)" :label="String(p.name)" :value="String(p.code)" /></ElSelect></ElFormItem><ElFormItem label="原因"><ElInput v-model="grant.reason" maxlength="200" /></ElFormItem></ElForm><template #footer><ElButton :loading="saving" type="primary" @click="grantSave">确认发放</ElButton></template></ElDialog>
<ElDialog v-model="deducting" title="扣除积分" width="520px" :close-on-click-modal="false" :close-on-press-escape="!deductSaving" :show-close="!deductSaving">
<ElForm label-position="top" :disabled="deductSaving"><ElFormItem label="用户"><ElInput :model-value="deduction.openid" disabled /></ElFormItem>
<ElAlert :title="`当前可用积分：${availablePoints}（不含冻结积分）`" type="warning" :closable="false" class="mb-4" />
<ElFormItem label="扣除积分"><ElInputNumber v-model="deduction.points" :min="1" :max="1000000000" :precision="0" /></ElFormItem>
<ElFormItem label="扣除原因（必填）"><ElInput v-model="deduction.reason" type="textarea" maxlength="200" show-word-limit /></ElFormItem></ElForm>
<template #footer><ElButton :disabled="deductSaving" @click="deducting=false">取消</ElButton><ElButton :loading="deductSaving" type="danger" @click="deductSave">确认扣除</ElButton></template>
</ElDialog>
<LoginHistoryDialog v-model="loginHistoryOpen" :openid="loginHistoryOwner" @updated="load" />
</Page>
</template>

<style scoped>
.overview-groups { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
.overview-group-wide { grid-column:1 / -1; }
.overview-group-title { margin:0; font-size:16px; font-weight:600; }
.overview-group-description { margin:0 0 16px; color:var(--el-text-color-secondary); font-size:12px; line-height:1.7; }
.overview-metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.overview-metrics-three { grid-template-columns:repeat(3,minmax(0,1fr)); }
.overview-metric { padding:16px; border-radius:8px; background:var(--el-fill-color-light); }
.overview-metric-label { color:var(--el-text-color-secondary); font-size:13px; }
.overview-metric-value { margin-top:10px; font-size:28px; font-weight:600; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
.overview-transcript-total { margin-bottom:12px; padding:20px; border-radius:8px; background:var(--el-color-primary-light-9); }
.overview-transcript-total .overview-metric-value { color:var(--el-color-primary); font-size:36px; }
.overview-transcript-parts { display:flex; flex-wrap:wrap; gap:8px 24px; margin-top:12px; color:var(--el-text-color-secondary); font-size:14px; }
.overview-transcript-parts strong { color:var(--el-text-color-primary); font-variant-numeric:tabular-nums; }
@media (max-width:767px) {
 .overview-groups,.overview-metrics,.overview-metrics-three { grid-template-columns:1fr; }
}

.history-share-copy { display:flex; align-items:center; width:100%; min-width:0; white-space:nowrap; }
.history-share-text { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.history-share-copy :deep(.copy-icon) { flex-shrink:0; }

.order-point-lines { display:flex; flex-direction:column; gap:4px; }
.order-point-balance { font-size:12px; color:var(--el-color-primary); font-variant-numeric:tabular-nums; }
.point-balance { font-weight:700; font-variant-numeric:tabular-nums; }
.ledger-user-info { display:flex; align-items:center; gap:6px; }
.ledger-user-nickname { color:var(--el-text-color-secondary); max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:1; }
.user-info-lines { display:flex; flex-direction:column; gap:6px; padding:4px 0; }
.user-info-lines > div { display:flex; align-items:center; min-width:0; gap:4px; }
.user-info-label { flex-shrink:0; color:var(--el-text-color-secondary); }
.user-info-value { min-width:0; flex:1; }
.user-info-ellipsis { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
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
.parse-platform-tag, .parse-scene-tag { max-width:100%; vertical-align:middle; }
.parse-platform-tag :deep(.el-tag__content), .parse-scene-tag :deep(.el-tag__content) { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.parse-status-tag { padding:0 3px; max-width:100%; }
</style>
