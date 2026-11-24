<script setup lang="ts">
import MediaFilePreview from './media-file-preview.vue';
import CategoryVoices from './category-voices.vue';
import CopyValue from '#/components/copy-value.vue';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';
import { ElAlert, ElButton, ElCard, ElDialog, ElForm, ElFormItem, ElInput, ElInputNumber, ElMessage, ElMessageBox, ElOption, ElPagination, ElSelect, ElSwitch, ElTable, ElTableColumn, ElTabs, ElTabPane, ElTooltip } from 'element-plus';
import { requestClient } from '#/api/request';
type Row = Record<string, any>;
type Result = { items: Row[]; total: number };
const categoryDrawer=ref(false);const activeCategory=ref<{id:number;name:string}>();
function openCategory(row:Row){activeCategory.value={id:Number(row.id),name:String(row.name)};categoryDrawer.value=true;}
const route=useRoute(); const access=useAccessStore();
const resource=computed(()=>String(route.meta.resource || 'providers'));
const storage=computed(()=>['buckets','uploads'].includes(resource.value));
const canEdit=computed(()=>access.accessCodes.includes(`${storage.value?'storage':'tts'}-${resource.value}:update`));
const readonly=computed(()=>['uploads','samples'].includes(resource.value));
const failedUploads=ref(new Set<string>());const deletingUploads=ref(new Set<string>());
const tableRef=ref<any>(null);const selectedUploads=ref<Row[]>([]);const purgingUploads=ref(new Set<string>());
const rows=ref<Row[]>([]); const total=ref(0); const page=ref(1); const busy=ref(false); const error=ref('');
const keyword=ref(''); const enabled=ref<number>(); const providerId=ref<number>(); const categoryId=ref<number>(); const sex=ref(''); const status=ref(''); const feature=ref('');
const providers=ref<Row[]>([]); const voices=ref<Row[]>([]); const categories=ref<Row[]>([]);
const dialog=ref(false); const creating=ref(false); const saving=ref(false); const selected=ref(''); const form=ref<Row>({}); const credentials=ref<Record<string,string>>({});
const viewing=ref(false); const detail=ref<Row>({}); const switching=ref(new Set<string>()); const previewing=ref(new Set<string>()); const audioUrl=ref('');
const uploadGuideOpen=ref(false);const guideTab=ref('cloud');
// 上传记录「功能」筛选，值需与后端 UPLOAD_FEATURE_FILTERS 一致。
const uploadFeatures=[
 {value:'watermark-upload',label:'上传视频去水印'},
 {value:'subtitle-upload',label:'上传视频去字幕'},
 {value:'result-watermark',label:'视频去水印结果'},
 {value:'result-subtitle',label:'视频去字幕结果'},
 {value:'share-cache',label:'分享链接解析缓存'},
 {value:'avatar',label:'用户头像'},
 {value:'voice-sample',label:'TTS 音色示例'},
 {value:'backup',label:'数据库备份'},
 {value:'mps',label:'腾讯云 MPS 转码'},
 {value:'video-notes',label:'视频笔记归档'},
];
// 云存储上传说明：按业务列出触发条件、对象 key 前缀与后端代码位置，便于在上传记录里反查来源。
const uploadGuideRows=[
 {business:'分享链接解析（缓存模式）',trigger:'解析分享链接；该平台输出模式为 cache（默认），未命中有效批次或云对象校验失败，且默认桶可用',location:'video/share-media/{平台}/{resourceKey}/{序号}-{MD5}.mp4',code:'persisted_media.py:234'},
 {business:'去水印/去字幕小程序直传',trigger:'后台上传方式=云端 + 默认桶为七牛；小程序领取凭证后自行 wx.uploadFile，文件不经过服务器',location:'direct/video-watermark/{openid哈希前16位}/{时间戳}-{随机}.{ext}、direct/video-subtitle/…',code:'direct_upload.py:48'},
 {business:'节点上传处理结果',trigger:'上述云端直传任务；worker 用签发凭证直传结果，只回传对象 key',location:'direct/video-watermark/…、direct/video-subtitle/…',code:'workers/media.py:98'},
 {business:'分享链接解析（腾讯云 MPS 引擎）',trigger:'后台视频云配置启用腾讯云 MPS，去水印任务走该引擎；结果对象由 MPS 写入',location:'creatorhub-mps/{taskId}/{attempt}/input.mp4、result/（腾讯云 COS，非七牛）',code:'mps_tasks.py:83'},
 {business:'视频笔记/总结产物归档',trigger:'视频总结、报告、TTS、笔记导出完成后自动归档；内容指纹未变则跳过，桶不可用时保留本地',location:'{image|video|audio}/video-notes/{owner哈希前24位}/{scope}/{md5}.{ext}',code:'video_notes_cloud.py:123'},
 {business:'用户头像',trigger:'用户上传/更新头像（包括随改昵称一并提交）',location:'image/avatars/{uuid}.jpg',code:'avatars.py:76'},
 {business:'TTS 音色示例',trigger:'首次生成音色示例、参数 fingerprint 变化时重建，或 recover 模式恢复',location:'audio/voice-samples/{fingerprint}.mp3',code:'voice_samples.py:111'},
 {business:'数据库备份',trigger:'管理员在后台点「数据库备份」且有 database:backup 权限，并选择云桶',location:'creatorhub-database-backups/{备份ID}.{sql|sql.gz|chdb}',code:'database_backup/service.py:161'},
];
// 上传记录按对象 key 前缀反推业务功能，与「云存储上传说明」里的目录一一对应。
function featureOf(row:Row){
 const key=String(row.object_key||'');
 const reason=String(row.reason||'');
 if(reason.startsWith('direct-result'))return key.includes('watermark')?'视频去水印结果':'视频去字幕结果';
 if(key.startsWith('direct/video-watermark/'))return '上传视频去水印';
 if(key.startsWith('direct/video-subtitle/'))return '上传视频去字幕';
 if(key.startsWith('video/share-media/'))return '分享链接解析缓存';
 if(key.startsWith('image/avatars/'))return '用户头像';
 if(key.startsWith('audio/voice-samples/'))return 'TTS 音色示例';
 if(key.startsWith('creatorhub-database-backups/'))return '数据库备份';
 if(key.startsWith('creatorhub-mps/'))return '腾讯云 MPS 转码';
 if(key.includes('/video-notes/'))return '视频笔记归档';
 return '其他';
}
const uploadGuideNoCloud=[
 '去水印/去字幕「上传到服务」模式：原视频只留服务端本地 watermark-tasks/<id>/input.mp4、subtitle-tasks/<id>/input.mp4，不会自动上云。',
 '图片压缩、图片去水印/高清：store_result() 只写本地文件，返回本地 token。',
 '图集解析：图片只登记源站 CDN 地址，不下载、不上传。',
 '后台业务媒体预览：只读取本地文件，不产生上传。',
];
// 本地文件存放说明：路径相对后端 data_dir（服务器上通常是项目目录下的 data/）。
const localGuideRows=[
 {business:'视频去字幕',path:'subtitle-tasks/<任务ID>/',files:'input.mp4、output.mp4、output.partial.mp4、metadata.json',clean:'结果保留 12 小时，过期自动清理文件；任务记录保留'},
 {business:'视频去水印',path:'video-watermark-tasks/<任务ID>/',files:'同上。云端直传 + 节点执行时服务端不留视频，目录通常只有 metadata.json',clean:'同上 12 小时；无任务记录的孤儿目录超过 12 小时后回收'},
 {business:'视频总结/笔记产物',path:'video-notes-engine/output/<任务ID> 或 frames_<任务ID>_<批次>/',files:'final_report.md 等报告、截帧图片、ASR 结果 json、subtitle_notes/、exports/',clean:'无定时过期清理。开启云归档后报告图片上传成功会删本地副本，读取时自动从云恢复'},
 {business:'视频总结输入',path:'video-notes-engine/uploads/、shared-sources/',files:'上传的原视频、解析共享源',clean:'随任务留存，无统一过期清理'},
 {business:'本地存储桶（上传到服务）',path:'uploads/',files:'按对象 key 存放的图片/视频/音频/文档；音色示例在 uploads/audio/voice-samples/',clean:'由上传记录管理，删除文件需在存储管理中操作'},
 {business:'图片处理',path:'image-records/<记录ID>/',files:'处理前的原图与处理结果',clean:'跟随图片记录保留'},
 {business:'用户头像',path:'avatars/<ID>.jpg',files:'头像图片',clean:'更新头像或删除用户时清理旧文件'},
 {business:'TTS 配音',path:'tts/（旧示例 tts/voice-samples/）',files:'合成的配音音频、历史音色示例',clean:'定时任务 tts_cleanup 清理过期配音'},
 {business:'文案提取',path:'text-inputs/、text-upload-archives/',files:'输入的视频/音频、上传归档与快照',clean:'上传临时文件请求结束即删；归档按 uploaded_video_cleanup 定时清理'},
 {business:'数据库备份',path:'database-backups/',files:'本地数据库备份文件',clean:'按备份记录保留'},
 {business:'解析缓存与临时文件',path:'watermark-cache/、gallery-cache/、tmp/',files:'解析视频缓存、图集图片缓存、请求临时文件',clean:'video_cache_cleanup / gallery_cache_cleanup 定时清理；tmp 启动及定时清理'},
 {business:'节点输入暂存',path:'worker-inputs/',files:'节点端执行时下载/暂存的输入文件',clean:'随任务结束清理'},
 {business:'日志与诊断',path:'logs/errors/、logs/direct-audio-debug.log、diagnostics/',files:'错误日志、音频调试日志、媒体耗时诊断',clean:'error_log_cleanup 定时清理过期日志'},
 {business:'模型与工具（非用户文件）',path:'models/、tools/lama、tools/realesrgan*',files:'ASR、去水印、超分模型与运行时',clean:'长期保留，勿手动删除'},
];
const localGuideNoFiles=[
 '去水印/去字幕配置为「上传到云端」且由节点处理时，服务端不下载原片、不保存结果，本地只有空任务目录和 metadata.json。',
 '分享链接解析命中缓存时只登记云对象 key，本地不留视频；图集图片只登记源站地址，不下载。',
 '各类 .lock、scheduled-task-locks/、cookies/、douyin-browser/ 等为内部运行状态文件，不在此表内，请勿手动删除。',
];
const qiniuRegions=[
 {value:'z0',label:'z0 - 华东-浙江'},
 {value:'z1',label:'z1 - 华北-河北'},
 {value:'z2',label:'z2 - 华南-广东'},
 {value:'na0',label:'na0 - 北美-洛杉矶'},
 {value:'as0',label:'as0 - 亚太-新加坡'},
 {value:'cn-east-2',label:'cn-east-2 - 华东-浙江2（存量）'},
 {value:'ap-southeast-2',label:'ap-southeast-2 - 亚太-河内（存量）'},
 {value:'ap-southeast-3',label:'ap-southeast-3 - 亚太-胡志明（存量）'}
];
const qiniuRegionTip='七牛云区域代码（保存的仍是 z0/z1/z2 等值）：\n'+qiniuRegions.map(r=>`${r.label}`).join('\n')+'\n上传域名会按区域自动推导；改完下次签发凭证即生效。';
const qiniuUploadTip='七牛云上传地址：\n留空时按「区域」自动推导上传域名，例如 z2 → https://up-z2.qiniup.com。\n显式填写的上传地址优先级最高，会盖掉区域推导；换区域时请同步修改或清空。\n改完无需重启，下次签发凭证即生效。';
function uploadSourceLabel(value: unknown){ return ({configured:'（指定）',region:'（区域推导）',default:'（默认）'} as Row)[String(value)]||''; }
function columnMinWidth(column: string){
 if(resource.value==='buckets')return ({name:120,code:120,provider:100,bucket:130,region:110,domain:220,upload_url:240,enabled:76,is_default:84} as Row)[column]||100;
 if(resource.value==='uploads')return ({created:170,object_key:360,media_type:90,size_bytes:100,status:100,reason:220,bucket_code:150} as Row)[column]||140;
 if(['preview_text','object_key'].includes(column))return 320;
 if(['domain','upload_url'].includes(column))return 260;
 return 140;
}
const labels:Record<string,string>={voice_name:'所属音色',categories:'所属分类',id:'ID',name:'名称',code:'英文标识',provider:'存储厂家',provider_id:'配音厂家',voice_code:'厂家音色标识',speech_type:'配音类型',sex:'性别',preview_text:'试听文案',default_preview_text:'默认试听文案',enabled:'启用状态',sort_order:'排序',weight:'权重',category_id:'分类',voice_id:'音色',tag:'标签',region:'区域',max_chars:'单次最大字数',has_credentials:'已配置凭据',bucket:'桶名称',domain:'访问域名',upload_url:'上传地址',is_private:'私有桶',is_default:'默认桶',fingerprint:'内容指纹',audio_url:'试听文件地址',storage_type:'存储类型',object_key:'文件路径',storage_ref:'原桶配置指纹',updated_at:'更新时间',created:'上传时间',bucket_code:'原桶代码',status:'上传结果',reason:'结果原因',size_bytes:'文件大小',media_type:'媒体类型'};
const credentialLabels:Record<string,string>={secret_id:'SecretId',secret_key:'SecretKey',access_key_id:'AccessKeyId',access_key_secret:'AccessKeySecret',app_key:'AppKey',access_key:'AccessKey'};
const credentialKeys=computed(()=>resource.value==='buckets'?['access_key','secret_key']:form.value.code==='aliyun'?['access_key_id','access_key_secret','app_key']:['secret_id','secret_key']);
const columns=computed(()=>({providers:['name','code','enabled','max_chars','has_credentials'],voices:['name','provider_id','voice_code','sex','enabled'],categories:['name','code','weight','enabled'],relations:['category_id','voice_id','tag','sort_order','enabled'],samples:['voice_name','preview_text','categories','storage_type','updated_at'],buckets:['name','code','provider','bucket','region','domain','upload_url','enabled','is_default'],uploads:['created','object_key','media_type','size_bytes','status','reason','bucket_code']}[resource.value] || []));
const defaults:Record<string,Row>={providers:{code:'tencent',name:'',enabled:0,sort_order:0,region:'ap-guangzhou',max_chars:600,default_preview_text:'你好，欢迎使用创作工具箱。'},voices:{provider_id:undefined,voice_code:'',name:'',speech_type:'',sex:'',preview_text:'',enabled:1},categories:{code:'',name:'',enabled:1,weight:0},relations:{category_id:undefined,voice_id:undefined,tag:'',enabled:1,sort_order:0},buckets:{code:'',name:'',provider:'qiniu',bucket:'',region:'',upload_url:'',domain:'',is_private:0,enabled:0,is_default:0}};
function key(row:Row){return resource.value==='relations'?`${row.category_id}:${row.voice_id}`:String(row.id??row.code);}
function display(row:Row,k:string){
 const value=row[k];
 if(k==='size_bytes'){
  if(value===null||value===undefined||value==='')return '—';
  const bytes=Number(value);if(!Number.isFinite(bytes)||bytes<0)return '—';
  const units=['B','KB','MB','GB','TB'];
  const unit=bytes>0?Math.max(0,Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),units.length-1)):0;
  return `${Number((bytes/1024**unit).toFixed(unit===0?0:2))} ${units[unit]}`;
 }
 if(k==='categories')return (value||[]).map((c:Row)=>c.name).join('、')||'未分类';
 if(k==='media_type')return ({image:'图片',video:'视频',audio:'音频',document:'文档'} as Row)[String(value)]||value;
 if(k==='provider_id')return providers.value.find(v=>v.id===value)?.name ?? value;
 if(k==='voice_id')return voices.value.find(v=>v.id===value)?.name ?? value;
 if(k==='category_id')return categories.value.find(v=>v.id===value)?.name ?? value;
 if(['created','updated_at'].includes(k))return value?new Date(Number(value)*1000).toLocaleString('zh-CN'):'—';
 if(k==='status')return ({success:'成功',pending:'待上传',fallback:'已回退本地',failed:'失败'} as Row)[value]??value;
 if(k==='sex')return ({male:'男',female:'女',child:'童声'} as Row)[value]??(value||'未指定');
 if(k==='has_credentials')return value?'已配置':'未配置';
 if(['is_private','is_default','enabled'].includes(k))return Number(value)===1?'是':'否';
 if(k==='reason'&&String(value)==='direct-ticket')return '直传凭证已签发';
 if(k==='reason'&&String(value).startsWith('direct-task:'))return '直传任务已提交';
 if(k==='reason'&&String(value).startsWith('direct-result:'))return '节点结果已直传';
 if(k==='reason'&&/^qiniu_(upload|domain)_http_[1-6][0-9]{2}$/.test(String(value)))return `${String(value).includes('_domain_')?'访问域名':'七牛上传'}返回 HTTP ${String(value).slice(-3)}`;
 if(k==='reason')return ({forced_local:'指定保存本地',unconfigured:'未配置云存储',upload_failed:'云上传失败',cloud_upload_failed:'云上传或校验失败',qiniu_sdk_error:'七牛SDK调用失败',qiniu_upload_failed:'七牛上传失败',qiniu_object_key_mismatch:'云对象路径不一致',qiniu_domain_timeout:'访问域名超时',qiniu_domain_connection_failed:'访问域名连接失败',local_or_input_failed:'文件输入或本地保存失败'} as Row)[value]??(value||'—');
 return value===''?'—':value;
}
let generation=0;
async function load(){
 const version=++generation;busy.value=true;error.value='';
 try{const result=await requestClient.get<Result>(`/catalog/${resource.value}`,{params:{page:page.value,page_size:20,keyword:keyword.value,enabled:enabled.value,provider_id:providerId.value,category_id:categoryId.value,sex:sex.value,status:status.value,feature:feature.value}});if(version===generation){failedUploads.value.clear();rows.value=result.items;total.value=result.total;}}
 catch(e){if(version===generation)error.value=e instanceof Error?e.message:'加载失败，请重试';}finally{if(version===generation)busy.value=false;}
}
async function options(name:string){return requestClient.get<Row[]>(`/catalog/options/${name}`);}
async function loadOptions(){providers.value=[];voices.value=[];categories.value=[];if(!canEdit.value)return;try{if(resource.value==='voices')providers.value=await options('providers');if(resource.value==='relations'){[voices.value,categories.value]=await Promise.all([options('voices'),options('categories')]);}}catch{error.value='选择器数据加载失败，请刷新重试';}}
function search(){page.value=1;tableRef.value?.clearSelection();selectedUploads.value=[];void load();}
const docOpen=ref(false);const docLoading=ref(false);const docContent=ref('');const docTruncated=ref(false);
async function openDocument(row:Row){
 docOpen.value=true;docLoading.value=true;docContent.value='';docTruncated.value=false;
 try{const result=await requestClient.get<{content:string;truncated:boolean}>(`/catalog/uploads/document/${encodeURIComponent(String(row.id))}`);docContent.value=String(result.content||'');docTruncated.value=result.truncated===true;}
 catch(e){docContent.value=e instanceof Error?e.message:'文档加载失败';}
 finally{docLoading.value=false;}
}
function edit(row?:Row){creating.value=!row;selected.value=row?key(row):'';form.value=Object.fromEntries(Object.keys(defaults[resource.value]||{}).map(k=>[k,row?row[k]:defaults[resource.value]![k]]));credentials.value={};dialog.value=true;}
async function save(){saving.value=true;try{const body={...form.value,...(['providers','buckets'].includes(resource.value)?{credentials:credentials.value}:{})};if(creating.value)await requestClient.post(`/catalog/${resource.value}`,body);else await requestClient.put(`/catalog/${resource.value}/${encodeURIComponent(selected.value)}`,body);dialog.value=false;ElMessage.success('保存成功');await load();await loadOptions();}finally{saving.value=false;}}
async function toggle(row:Row){const id=key(row);if(switching.value.has(id))return;switching.value.add(id);try{await requestClient.put(`/catalog/${resource.value}/${encodeURIComponent(id)}`,{enabled:Number(row.enabled)===1?0:1});await load();}finally{switching.value.delete(id);}}
async function view(row:Row){detail.value=await requestClient.get<Row>(`/catalog/${resource.value}/${encodeURIComponent(key(row))}`);viewing.value=true;}
const clearingUploads=ref(false);
async function clearMissingUploads(){
 if(clearingUploads.value)return;
 const filters={keyword:keyword.value,status:status.value};
 try{await ElMessageBox.confirm('检查当前筛选条件下的全部上传记录（不限当前页）。仅清除后台确认文件不存在的记录，文件仍存在或无法确认的记录会保留。是否继续？','一键清除无效文件',{type:'warning',confirmButtonText:'开始检查并清除',cancelButtonText:'取消'});}catch{return;}
 clearingUploads.value=true;let after='';let checked=0;let deleted=0;let skipped=0;
 try{
  while(true){
   const result=await requestClient.post<{checked:number;deleted:number;skipped:number;next_cursor:string;done:boolean}>('/catalog/uploads/clear-missing',undefined,{params:{...filters,after},timeout:180000});
   checked+=result.checked;deleted+=result.deleted;skipped+=result.skipped;
   if(result.done)break;
   if(result.next_cursor===after)throw new Error('清理进度未更新，请重试');
   after=result.next_cursor;
  }
  ElMessage.success(`检查 ${checked} 条，清除 ${deleted} 条，保留 ${skipped} 条`);
 }catch{ElMessage.warning(`清理中断，已确认清除 ${deleted} 条；可重新执行，剩余记录会再次检查`);}
 finally{clearingUploads.value=false;if(resource.value==='uploads'){page.value=1;await load();}}
}
async function deleteUpload(row:Row){
 const id=String(row.id);if(deletingUploads.value.has(id))return;
 try{await ElMessageBox.confirm('后台将检查文件是否存在，仅在确认不存在后删除上传记录；文件存在或检查失败时保留记录。是否继续？','删除上传记录',{type:'warning',confirmButtonText:'删除记录',cancelButtonText:'取消'});}catch{return;}
 deletingUploads.value.add(id);
 try{await requestClient.delete(`/catalog/uploads/${encodeURIComponent(id)}`);ElMessage.success('上传记录已删除');if(rows.value.length===1&&page.value>1)page.value--;await load();}finally{deletingUploads.value.delete(id);}
}
function onSelectionChange(items:Row[]){selectedUploads.value=items;}
async function purgeIds(ids:string[]){
 if(!ids.length||ids.some(id=>purgingUploads.value.has(id)))return;
 const message=`即将永久删除选中的 <b>${ids.length}</b> 条上传记录，并同步删除对应的<b>云端存储文件</b>。<br/><br/><b style="color:#f56c6c">危险：此操作不可恢复！</b> 删除后原视频、结果视频、图片和文档都无法再预览或下载，仍在使用这些文件的任务会失败。<br/><br/>请确认这些文件已不再需要。`;
 try{await ElMessageBox.confirm(message,'危险操作：永久删除文件与记录',{type:'error',dangerouslyUseHTMLString:true,confirmButtonText:'我已知晓，永久删除',cancelButtonText:'取消',confirmButtonClass:'el-button--danger'});}catch{return;}
 ids.forEach(id=>purgingUploads.value.add(id));
 try{
  const result=await requestClient.post<{deleted:number;cloud_deleted:number;failed:{id:string;reason:string}[]}>('/catalog/uploads/purge',{ids},{timeout:180000});
  const failed=result.failed||[];
  if(failed.length)ElMessage.warning(`已删除 ${result.deleted} 条（云端文件 ${result.cloud_deleted} 个），失败 ${failed.length} 条：${failed[0].reason}`);
  else ElMessage.success(`已永久删除 ${result.deleted} 条记录及 ${result.cloud_deleted} 个云端文件`);
  tableRef.value?.clearSelection();selectedUploads.value=[];
  if(pagesNeedReset(ids.length))page.value=1;
  await load();
 }catch(e){ElMessage.error(e instanceof Error?e.message:'永久删除失败，请检查存储桶配置后重试');}
 finally{ids.forEach(id=>purgingUploads.value.delete(id));}
}
function purgeSelected(){void purgeIds(selectedUploads.value.map(row=>String(row.id)));}
function purgeOne(row:Row){void purgeIds([String(row.id)]);}
function pagesNeedReset(count:number){return rows.value.length<=count&&page.value>1;}
async function playSample(row:Row){const id=key(row);previewing.value.add(id);try{const result=await requestClient.get<{audioUrl:string}>(`/catalog/samples/${encodeURIComponent(id)}/play`);if(resource.value==='samples')audioUrl.value=result.audioUrl;}finally{previewing.value.delete(id);}}
async function preview(row:Row){const id=String(row.id);try{await ElMessageBox.confirm('将复用已有试听缓存；缓存失效时调用配音厂家生成并保存试听文件，可能产生云服务费用。是否继续？','生成或获取试听',{confirmButtonText:'继续',cancelButtonText:'取消',type:'warning'});}catch{return;}previewing.value.add(id);try{const result=await requestClient.post<{audioUrl:string}>(`/catalog/voices/${id}/preview`);audioUrl.value=result.audioUrl;}finally{previewing.value.delete(id);}}
watch(()=>form.value.code,(code)=>{if(creating.value&&resource.value==='providers')form.value.region=code==='aliyun'?'cn-shanghai':'ap-guangzhou';});
watch(resource,()=>{categoryDrawer.value=false;});
watch(resource,()=>{page.value=1;keyword.value='';enabled.value=undefined;providerId.value=undefined;categoryId.value=undefined;sex.value='';status.value='';feature.value='';rows.value=[];audioUrl.value='';dialog.value=false;viewing.value=false;docOpen.value=false;tableRef.value?.clearSelection();selectedUploads.value=[];void load();void loadOptions();},{immediate:true});
</script>
<template>
 <CategoryVoices v-model="categoryDrawer" :category="activeCategory"/>
 <Page :title="String(route.meta.title||'配音与存储')">
  <ElCard>
   <ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-4" />
   <ElAlert v-if="resource==='uploads'" title="仅记录启用审计后的上传；失败原因已脱敏。切换默认桶不会修改历史文件关联。" type="info" :closable="false" class="mb-4" />
   <ElAlert v-if="resource==='samples'" title="试听文件由音色页面的“生成试听”操作维护，读取列表及播放已有文件不会调用云合成。示例文本展示当前配置，修改文案后可能与旧文件内容不同。" type="info" :closable="false" class="mb-4" />
   <div class="mb-4 flex flex-wrap gap-2">
    <ElInput v-model="keyword" placeholder="名称、标识或文件路径" clearable style="width:240px" @keyup.enter="search" />
    <ElSelect v-if="!readonly" v-model="enabled" placeholder="全部状态" clearable style="width:140px"><ElOption label="启用" :value="1"/><ElOption label="停用" :value="0"/></ElSelect>
    <ElSelect v-if="resource==='voices'" v-model="providerId" placeholder="全部厂家" clearable filterable style="width:170px"><ElOption v-for="p in providers" :key="p.id" :label="p.name" :value="p.id"/></ElSelect>
    <ElSelect v-if="resource==='voices'" v-model="sex" placeholder="全部性别" clearable style="width:140px"><ElOption label="男" value="male"/><ElOption label="女" value="female"/><ElOption label="童声" value="child"/></ElSelect>
    <ElSelect v-if="resource==='relations'" v-model="categoryId" placeholder="全部分类" clearable filterable style="width:170px"><ElOption v-for="c in categories" :key="c.id" :label="c.name" :value="c.id"/></ElSelect>
    <ElSelect v-if="resource==='uploads'" v-model="status" placeholder="全部结果" clearable style="width:150px"><ElOption label="成功" value="success"/><ElOption label="待上传" value="pending"/><ElOption label="已回退本地" value="fallback"/><ElOption label="失败" value="failed"/></ElSelect>
    <ElSelect v-if="resource==='uploads'" v-model="feature" placeholder="全部功能" clearable filterable style="width:180px"><ElOption v-for="item in uploadFeatures" :key="item.value" :label="item.label" :value="item.value"/></ElSelect>
    <ElButton :loading="busy" @click="search">查询</ElButton><ElButton v-if="resource==='uploads'&&access.accessCodes.includes('storage-uploads:delete')" type="danger" :disabled="!selectedUploads.length" :loading="selectedUploads.some(row=>purgingUploads.has(String(row.id)))" @click="purgeSelected">永久删除所选（含云端文件）</ElButton><ElButton v-if="resource==='uploads'&&access.accessCodes.includes('storage-uploads:delete')" type="danger" plain :loading="clearingUploads" @click="clearMissingUploads">一键清除无效文件</ElButton><ElButton v-if="canEdit&&!readonly" type="primary" @click="edit()">新增</ElButton><ElButton v-if="resource==='buckets'" @click="guideTab='cloud';uploadGuideOpen=true">云存储上传说明</ElButton><ElButton v-if="resource==='buckets'" @click="guideTab='local';uploadGuideOpen=true">本地文件存放说明</ElButton>
   </div>
   <audio v-if="audioUrl" :key="audioUrl" :src="audioUrl" controls autoplay @error="ElMessage.error('音频加载失败，请检查文件或存储桶访问状态')" class="mb-4" />
   <ElTable ref="tableRef" v-loading="busy" :data="rows" empty-text="暂无记录" @selection-change="onSelectionChange"><ElTableColumn v-if="resource==='uploads'" type="selection" width="48" fixed="left" /><ElTableColumn v-if="resource==='uploads'" label="ID" width="130" fixed="left"><template #default="{row}"><CopyValue :value="row.id" label="复制记录ID"><span :title="String(row.id)">{{ String(row.id||'').slice(0,8) }}…</span></CopyValue></template></ElTableColumn><ElTableColumn v-if="resource==='uploads'" label="功能" width="110"><template #default="{row}"><span>{{featureOf(row)}}</span></template></ElTableColumn><ElTableColumn v-if="resource==='uploads'" label="预览" width="90"><template #default="{row}"><MediaFilePreview v-if="['image','video','audio'].includes(row.media_type)" :file="row" compact @error="failedUploads.add(String(row.id))" @loaded="failedUploads.delete(String(row.id))"/><ElButton v-else-if="/\.(md|txt)$/i.test(String(row.object_key||''))" link type="primary" :disabled="!row.object_url" @click="openDocument(row)">查看文档</ElButton><span v-else>—</span></template></ElTableColumn>
    <ElTableColumn v-for="column in columns" :key="column" :label="labels[column]" :min-width="columnMinWidth(column)">
     <template #header><span>{{ labels[column] }}</span><ElTooltip v-if="resource==='buckets'&&column==='region'" :content="qiniuRegionTip" placement="top" popper-class="qiniu-hint-tooltip"><span class="hint-icon">?</span></ElTooltip><ElTooltip v-else-if="resource==='buckets'&&column==='upload_url'" :content="qiniuUploadTip" placement="top" popper-class="qiniu-hint-tooltip"><span class="hint-icon">?</span></ElTooltip></template>
     <template #default="{row}">
     <ElSwitch v-if="column==='enabled'" :model-value="Number(row.enabled)" :active-value="1" :inactive-value="0" :disabled="!canEdit" :loading="switching.has(key(row))" @change="toggle(row)" />
     <ElTooltip v-else-if="resource==='categories'&&column==='name'&&access.accessCodes.includes('tts-relations:read')" content="查看音色" placement="right" :show-after="150"><ElButton class="category-entry" type="primary" plain :aria-label="`查看${row.name}分类下的音色`" @click="openCategory(row)"><span class="category-entry-name">{{ row.name }}</span><span class="category-entry-hint" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="12" width="4" height="9" rx="2"/><rect x="17" y="12" width="4" height="9" rx="2"/></svg></span></ElButton></ElTooltip>
     <CopyValue v-else-if="resource==='buckets'&&column==='upload_url'" :value="row.upload_endpoint||row.upload_url" :label="'复制'+labels[column]"><span>{{ row.upload_endpoint||row.upload_url||'—' }}<small class="upload-source">{{ uploadSourceLabel(row.upload_endpoint_source) }}</small></span></CopyValue>
     <CopyValue v-else-if="['audio_url','object_key','object_url','domain','upload_url'].includes(column)" :value="row[column]" :label="'复制'+labels[column]" /><span v-else style="white-space:pre-wrap;overflow-wrap:anywhere">{{ display(row,column) }}</span>
    </template></ElTableColumn>
    <ElTableColumn label="操作" :width="resource==='uploads'?220:resource==='buckets'?130:250" fixed="right"><template #default="{row}"><CopyValue v-if="resource==='uploads'&&row.object_url" :value="row.object_url" label="复制链接" icon-only /><ElButton v-if="resource==='samples'" link :loading="previewing.has(key(row))" @click="playSample(row)">试听</ElButton><ElButton v-if="resource==='uploads'&&access.accessCodes.includes('storage-uploads:delete')&&(failedUploads.has(String(row.id))||!row.object_url)" link type="danger" :loading="deletingUploads.has(String(row.id))" @click="deleteUpload(row)">删除记录</ElButton><ElButton v-if="resource==='uploads'&&access.accessCodes.includes('storage-uploads:delete')" link type="danger" :loading="purgingUploads.has(String(row.id))" @click="purgeOne(row)">永久删除</ElButton><ElButton link @click="view(row)">详情</ElButton><ElButton v-if="canEdit&&!readonly" link type="primary" @click="edit(row)">编辑</ElButton><ElButton v-if="access.accessCodes.includes('tts-voices:preview')&&resource==='voices'" link :loading="previewing.has(String(row.id))" @click="preview(row)">生成试听</ElButton></template></ElTableColumn>
   </ElTable>
   <ElPagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next, jumper, slot" class="mt-4" @current-change="load" style="justify-content:center;flex-wrap:wrap;row-gap:8px"><ElButton size="small" :disabled="page<=1" @click="page=1;load()">首页</ElButton><ElButton size="small" :disabled="page>=Math.max(1,Math.ceil((total)/(20)))" @click="page=Math.max(1,Math.ceil((total)/(20)));load()">末页</ElButton></ElPagination>
  </ElCard>
  <ElDialog v-model="uploadGuideOpen" title="存储说明" width="min(1120px,96vw)" top="5vh">
   <ElTabs v-model="guideTab">
    <ElTabPane label="云存储上传说明" name="cloud">
     <ElAlert title="默认桶即下表各业务的云存储目标；未配置或探测不可用时，除小程序/节点直传外都会回退本地，不产生云对象。腾讯云 MPS 使用独立配置，不写入七牛。" type="info" :closable="false" class="mb-3" />
     <ElTable :data="uploadGuideRows" border max-height="55vh" size="small">
      <ElTableColumn prop="business" label="业务" width="190" />
      <ElTableColumn prop="trigger" label="触发条件" min-width="330"><template #default="{row}"><span style="white-space:normal;overflow-wrap:anywhere">{{row.trigger}}</span></template></ElTableColumn>
      <ElTableColumn prop="location" label="云上位置（object key）" min-width="390"><template #default="{row}"><span style="white-space:normal;overflow-wrap:anywhere">{{row.location}}</span></template></ElTableColumn>
      <ElTableColumn prop="code" label="后端位置" width="180" />
     </ElTable>
     <p class="mt-3 mb-1 font-semibold">不走云的操作（排查时可先排除）</p>
     <ul class="list-disc pl-5 text-sm space-y-1"><li v-for="item in uploadGuideNoCloud" :key="item">{{item}}</li></ul>
    </ElTabPane>
    <ElTabPane label="本地文件存放说明" name="local">
     <ElAlert title="下表路径相对后端 data_dir（服务器上通常是项目目录下的 data/）。本地文件与云存储是两套：配置了云端上传时，本地可能没有对应文件。删除文件前请确认任务已结束。" type="info" :closable="false" class="mb-3" />
     <ElTable :data="localGuideRows" border max-height="55vh" size="small">
      <ElTableColumn prop="business" label="功能" width="180" />
      <ElTableColumn prop="path" label="本地路径（相对 data_dir）" min-width="320"><template #default="{row}"><span style="white-space:normal;overflow-wrap:anywhere">{{row.path}}</span></template></ElTableColumn>
      <ElTableColumn prop="files" label="主要文件" min-width="330"><template #default="{row}"><span style="white-space:normal;overflow-wrap:anywhere">{{row.files}}</span></template></ElTableColumn>
      <ElTableColumn prop="clean" label="清理策略" min-width="300"><template #default="{row}"><span style="white-space:normal;overflow-wrap:anywhere">{{row.clean}}</span></template></ElTableColumn>
     </ElTable>
     <p class="mt-3 mb-1 font-semibold">不落本地文件的情况（排查时可先排除）</p>
     <ul class="list-disc pl-5 text-sm space-y-1"><li v-for="item in localGuideNoFiles" :key="item">{{item}}</li></ul>
    </ElTabPane>
   </ElTabs>
   <template #footer><ElButton type="primary" @click="uploadGuideOpen=false">知道了</ElButton></template>
  </ElDialog>
  <ElDialog v-model="docOpen" title="文档预览" width="min(900px,92vw)" top="5vh">
   <div v-loading="docLoading" style="min-height:120px"><pre class="doc-body">{{docContent}}</pre><p v-if="docTruncated" class="mt-2 text-xs text-gray-500">文档过长，仅显示前 2MB。</p></div>
   <template #footer><ElButton @click="docOpen=false">关闭</ElButton></template>
  </ElDialog>
  <ElDialog v-model="dialog" :title="creating?'新增配置':'编辑配置'" width="min(640px,95vw)" :close-on-click-modal="!saving">
   <ElForm label-width="130px" @submit.prevent="save">
    <template v-if="resource==='providers'">
     <ElFormItem label="配音厂家"><ElSelect v-model="form.code" :disabled="!creating"><ElOption v-if="!creating&&!'tencent,aliyun'.split(',').includes(form.code)" :label="form.name" :value="form.code"/><ElOption label="腾讯云" value="tencent"/><ElOption label="阿里云" value="aliyun"/></ElSelect></ElFormItem>
     <ElFormItem label="显示名称"><ElInput v-model="form.name" maxlength="100"/></ElFormItem>
     <ElFormItem label="区域"><ElInput v-model="form.region"/></ElFormItem>
     <ElFormItem label="单次最大字数"><ElInputNumber v-model="form.max_chars" :min="1" :max="600"/></ElFormItem>
     <ElFormItem label="默认试听文案"><ElInput v-model="form.default_preview_text" type="textarea" :rows="3" maxlength="10000"/></ElFormItem>
     <ElFormItem label="排序"><ElInputNumber v-model="form.sort_order" :min="0"/></ElFormItem>
    </template>
    <template v-if="resource==='voices'">
     <ElFormItem label="厂家"><ElSelect v-model="form.provider_id" :disabled="!creating" filterable><ElOption v-for="p in providers" :key="p.id" :label="p.name" :value="p.id"/></ElSelect></ElFormItem>
     <ElFormItem label="厂家音色标识"><ElInput v-model="form.voice_code" :disabled="!creating" maxlength="128"/></ElFormItem>
     <ElFormItem label="音色名称"><ElInput v-model="form.name" maxlength="100"/></ElFormItem>
     <ElFormItem label="配音类型"><ElInput v-model="form.speech_type" maxlength="128"/></ElFormItem>
     <ElFormItem label="性别"><ElSelect v-model="form.sex"><ElOption v-if="['男','女','童声'].includes(form.sex)" :label="form.sex" :value="form.sex"/><ElOption label="未指定" value=""/><ElOption label="男" value="male"/><ElOption label="女" value="female"/><ElOption label="童声" value="child"/></ElSelect></ElFormItem>
     <ElFormItem label="试听文案"><ElInput v-model="form.preview_text" type="textarea" :rows="3" placeholder="留空沿用厂家默认文案" maxlength="10000"/></ElFormItem>
    </template>
    <template v-if="resource==='categories'">
     <ElFormItem label="英文code"><ElInput v-model="form.code" :disabled="!creating" maxlength="64"/></ElFormItem>
     <ElFormItem label="分类名称"><ElInput v-model="form.name" maxlength="100"/></ElFormItem>
     <ElFormItem label="权重（高值优先）"><ElInputNumber v-model="form.weight" :min="0"/></ElFormItem>
    </template>
    <template v-if="resource==='relations'">
     <ElFormItem label="分类"><ElSelect v-model="form.category_id" :disabled="!creating" filterable><ElOption v-for="c in categories" :key="c.id" :label="c.name" :value="c.id"/></ElSelect></ElFormItem>
     <ElFormItem label="音色"><ElSelect v-model="form.voice_id" :disabled="!creating" filterable><ElOption v-for="v in voices" :key="v.id" :label="`${v.name} (${v.voice_code})`" :value="v.id"/></ElSelect></ElFormItem>
     <ElFormItem label="标签"><ElInput v-model="form.tag" maxlength="100"/></ElFormItem>
     <ElFormItem label="排序（低值优先）"><ElInputNumber v-model="form.sort_order" :min="0"/></ElFormItem>
    </template>
    <template v-if="resource==='buckets'">
     <ElFormItem label="英文标识"><ElInput v-model="form.code" :disabled="!creating" maxlength="64"/></ElFormItem>
     <ElFormItem label="名称"><ElInput v-model="form.name" maxlength="100"/></ElFormItem>
     <ElFormItem label="厂家"><ElSelect v-model="form.provider" disabled><ElOption label="七牛云" value="qiniu"/></ElSelect></ElFormItem>
     <ElFormItem label="桶名称"><ElInput v-model="form.bucket"/></ElFormItem>
     <ElFormItem>
      <template #label>区域 <ElTooltip :content="qiniuRegionTip" placement="top" popper-class="qiniu-hint-tooltip"><span class="hint-icon">?</span></ElTooltip></template>
      <ElSelect v-model="form.region" clearable placeholder="留空则自动查询七牛区域">
       <ElOption v-if="form.region&&!qiniuRegions.some(item=>item.value===form.region)" :label="form.region" :value="form.region"/>
       <ElOption v-for="item in qiniuRegions" :key="item.value" :label="item.label" :value="item.value"/>
      </ElSelect>
     </ElFormItem>
     <ElFormItem label="访问域名"><ElInput v-model="form.domain" placeholder="https://cdn.example.com"/></ElFormItem>
     <ElFormItem>
      <template #label>上传地址 <ElTooltip :content="qiniuUploadTip" placement="top" popper-class="qiniu-hint-tooltip"><span class="hint-icon">?</span></ElTooltip></template>
      <ElInput v-model="form.upload_url" placeholder="留空则按区域自动推导"/>
     </ElFormItem>
     <ElFormItem label="私有桶"><ElSwitch v-model="form.is_private" :active-value="1" :inactive-value="0"/></ElFormItem>
     <ElFormItem label="默认桶"><ElSwitch v-model="form.is_default" :active-value="1" :inactive-value="0"/><span class="ml-2">保存后取消其他桶的默认状态</span></ElFormItem>
    </template>
    <template v-if="['providers','buckets'].includes(resource)">
     <ElAlert title="凭据不会回显；留空保持原值。新增或启用前需填写完整凭据。" type="info" :closable="false" class="mb-4"/>
     <ElFormItem v-for="field in credentialKeys" :key="field" :label="credentialLabels[field]"><ElInput v-model="credentials[field]" type="password" show-password autocomplete="new-password" placeholder="留空不修改"/></ElFormItem>
    </template>
    <ElFormItem label="启用"><ElSwitch v-model="form.enabled" :active-value="1" :inactive-value="0"/></ElFormItem>
   </ElForm>
   <template #footer><ElButton :disabled="saving" @click="dialog=false">取消</ElButton><ElButton type="primary" :loading="saving" @click="save">保存</ElButton></template>
  </ElDialog>
  <ElDialog v-model="viewing" title="记录详情" width="min(760px,95vw)"><dl class="grid grid-cols-[140px_1fr] gap-3"><template v-for="k in Object.keys(detail)" :key="k"><dt>{{labels[k]||k}}</dt><dd class="break-all"><CopyValue v-if="['audio_url','object_key','object_url','domain','upload_url'].includes(String(k))" :value="detail[k]" :label="'复制'+(labels[k]||k)" /><template v-else>{{display(detail,String(k))}}</template></dd></template></dl></ElDialog>
 </Page>
</template>

<style scoped>
.category-entry { width: auto; max-width: 100%; height: auto; min-height: 34px; padding: 6px 10px; border-radius: 8px; text-align: left; }
.category-entry :deep(> span) { width: 100%; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 10px; }
.category-entry-name { font-weight: 600; white-space: normal; overflow-wrap: anywhere; }
.category-entry-hint { display: inline-flex; align-items: center; font-size: 12px; white-space: nowrap; color: var(--el-text-color-placeholder); opacity: 0.55; }
.category-entry:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.doc-body { margin: 0; max-height: 65vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 13px; line-height: 1.6; }
.hint-icon { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; margin-left: 4px; border-radius: 50%; background: var(--el-color-info-light-7); color: var(--el-color-info); font-size: 11px; line-height: 1; cursor: help; vertical-align: middle; }
.upload-source { margin-left: 3px; color: var(--el-text-color-secondary); white-space: nowrap; }
:deep(.qiniu-hint-tooltip) { white-space: pre-line; max-width: 360px; line-height: 1.6; }
</style>
