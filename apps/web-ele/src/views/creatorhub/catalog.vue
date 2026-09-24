<script setup lang="ts">
import MediaFilePreview from './media-file-preview.vue';
import CategoryVoices from './category-voices.vue';
import CopyValue from '#/components/copy-value.vue';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';
import { ElAlert, ElButton, ElCard, ElDialog, ElForm, ElFormItem, ElInput, ElInputNumber, ElMessage, ElMessageBox, ElOption, ElPagination, ElSelect, ElSwitch, ElTable, ElTableColumn, ElTooltip } from 'element-plus';
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
const rows=ref<Row[]>([]); const total=ref(0); const page=ref(1); const busy=ref(false); const error=ref('');
const keyword=ref(''); const enabled=ref<number>(); const providerId=ref<number>(); const categoryId=ref<number>(); const sex=ref(''); const status=ref('');
const providers=ref<Row[]>([]); const voices=ref<Row[]>([]); const categories=ref<Row[]>([]);
const dialog=ref(false); const creating=ref(false); const saving=ref(false); const selected=ref(''); const form=ref<Row>({}); const credentials=ref<Record<string,string>>({});
const viewing=ref(false); const detail=ref<Row>({}); const switching=ref(new Set<string>()); const previewing=ref(new Set<string>()); const audioUrl=ref('');
const labels:Record<string,string>={voice_name:'所属音色',categories:'所属分类',id:'ID',name:'名称',code:'英文标识',provider:'存储厂家',provider_id:'配音厂家',voice_code:'厂家音色标识',speech_type:'配音类型',sex:'性别',preview_text:'试听文案',default_preview_text:'默认试听文案',enabled:'启用状态',sort_order:'排序',weight:'权重',category_id:'分类',voice_id:'音色',tag:'标签',region:'区域',max_chars:'单次最大字数',has_credentials:'已配置凭据',bucket:'桶名称',domain:'访问域名',upload_url:'上传地址',is_private:'私有桶',is_default:'默认桶',fingerprint:'内容指纹',audio_url:'试听文件地址',storage_type:'存储类型',object_key:'文件路径',storage_ref:'原桶配置指纹',updated_at:'更新时间',created:'上传时间',bucket_code:'原桶代码',status:'上传结果',reason:'结果原因',size_bytes:'文件大小',media_type:'媒体类型'};
const credentialLabels:Record<string,string>={secret_id:'SecretId',secret_key:'SecretKey',access_key_id:'AccessKeyId',access_key_secret:'AccessKeySecret',app_key:'AppKey',access_key:'AccessKey'};
const credentialKeys=computed(()=>resource.value==='buckets'?['access_key','secret_key']:form.value.code==='aliyun'?['access_key_id','access_key_secret','app_key']:['secret_id','secret_key']);
const columns=computed(()=>({providers:['name','code','enabled','max_chars','has_credentials'],voices:['name','provider_id','voice_code','sex','enabled'],categories:['name','code','weight','enabled'],relations:['category_id','voice_id','tag','sort_order','enabled'],samples:['voice_name','preview_text','categories','storage_type','updated_at'],buckets:['name','code','provider','bucket','enabled','is_default'],uploads:['created','bucket_code','object_key','media_type','size_bytes','status','reason']}[resource.value] || []));
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
 if(k==='media_type')return ({image:'图片',video:'视频',audio:'音频'} as Row)[String(value)]||value;
 if(k==='provider_id')return providers.value.find(v=>v.id===value)?.name ?? value;
 if(k==='voice_id')return voices.value.find(v=>v.id===value)?.name ?? value;
 if(k==='category_id')return categories.value.find(v=>v.id===value)?.name ?? value;
 if(['created','updated_at'].includes(k))return value?new Date(Number(value)*1000).toLocaleString('zh-CN'):'—';
 if(k==='status')return ({success:'成功',fallback:'已回退本地',failed:'失败'} as Row)[value]??value;
 if(k==='sex')return ({male:'男',female:'女',child:'童声'} as Row)[value]??(value||'未指定');
 if(k==='has_credentials')return value?'已配置':'未配置';
 if(['is_private','is_default','enabled'].includes(k))return Number(value)===1?'是':'否';
 if(k==='reason'&&/^qiniu_(upload|domain)_http_[1-6][0-9]{2}$/.test(String(value)))return `${String(value).includes('_domain_')?'访问域名':'七牛上传'}返回 HTTP ${String(value).slice(-3)}`;
 if(k==='reason')return ({forced_local:'指定保存本地',unconfigured:'未配置云存储',upload_failed:'云上传失败',cloud_upload_failed:'云上传或校验失败',qiniu_sdk_error:'七牛SDK调用失败',qiniu_upload_failed:'七牛上传失败',qiniu_object_key_mismatch:'云对象路径不一致',qiniu_domain_timeout:'访问域名超时',qiniu_domain_connection_failed:'访问域名连接失败',local_or_input_failed:'文件输入或本地保存失败'} as Row)[value]??(value||'—');
 return value===''?'—':value;
}
let generation=0;
async function load(){
 const version=++generation;busy.value=true;error.value='';
 try{const result=await requestClient.get<Result>(`/catalog/${resource.value}`,{params:{page:page.value,page_size:20,keyword:keyword.value,enabled:enabled.value,provider_id:providerId.value,category_id:categoryId.value,sex:sex.value,status:status.value}});if(version===generation){failedUploads.value.clear();rows.value=result.items;total.value=result.total;}}
 catch(e){if(version===generation)error.value=e instanceof Error?e.message:'加载失败，请重试';}finally{if(version===generation)busy.value=false;}
}
async function options(name:string){return requestClient.get<Row[]>(`/catalog/options/${name}`);}
async function loadOptions(){providers.value=[];voices.value=[];categories.value=[];if(!canEdit.value)return;try{if(resource.value==='voices')providers.value=await options('providers');if(resource.value==='relations'){[voices.value,categories.value]=await Promise.all([options('voices'),options('categories')]);}}catch{error.value='选择器数据加载失败，请刷新重试';}}
function search(){page.value=1;void load();}
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
async function playSample(row:Row){const id=key(row);previewing.value.add(id);try{const result=await requestClient.get<{audioUrl:string}>(`/catalog/samples/${encodeURIComponent(id)}/play`);if(resource.value==='samples')audioUrl.value=result.audioUrl;}finally{previewing.value.delete(id);}}
async function preview(row:Row){const id=String(row.id);try{await ElMessageBox.confirm('将复用已有试听缓存；缓存失效时调用配音厂家生成并保存试听文件，可能产生云服务费用。是否继续？','生成或获取试听',{confirmButtonText:'继续',cancelButtonText:'取消',type:'warning'});}catch{return;}previewing.value.add(id);try{const result=await requestClient.post<{audioUrl:string}>(`/catalog/voices/${id}/preview`);audioUrl.value=result.audioUrl;}finally{previewing.value.delete(id);}}
watch(()=>form.value.code,(code)=>{if(creating.value&&resource.value==='providers')form.value.region=code==='aliyun'?'cn-shanghai':'ap-guangzhou';});
watch(resource,()=>{categoryDrawer.value=false;});
watch(resource,()=>{page.value=1;keyword.value='';enabled.value=undefined;providerId.value=undefined;categoryId.value=undefined;sex.value='';status.value='';rows.value=[];audioUrl.value='';dialog.value=false;viewing.value=false;void load();void loadOptions();},{immediate:true});
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
    <ElSelect v-if="resource==='uploads'" v-model="status" placeholder="全部结果" clearable style="width:150px"><ElOption label="成功" value="success"/><ElOption label="已回退本地" value="fallback"/><ElOption label="失败" value="failed"/></ElSelect>
    <ElButton :loading="busy" @click="search">查询</ElButton><ElButton v-if="resource==='uploads'&&access.accessCodes.includes('storage-uploads:delete')" type="danger" plain :loading="clearingUploads" @click="clearMissingUploads">一键清除无效文件</ElButton><ElButton v-if="canEdit&&!readonly" type="primary" @click="edit()">新增</ElButton>
   </div>
   <audio v-if="audioUrl" :key="audioUrl" :src="audioUrl" controls autoplay @error="ElMessage.error('音频加载失败，请检查文件或存储桶访问状态')" class="mb-4" />
   <ElTable v-loading="busy" :data="rows" empty-text="暂无记录"><ElTableColumn v-if="resource==='uploads'" prop="id" label="ID" width="280" fixed="left"/><ElTableColumn v-if="resource==='uploads'" label="预览" width="130"><template #default="{row}"><MediaFilePreview v-if="['image','video','audio'].includes(row.media_type)" :file="row" compact @error="failedUploads.add(String(row.id))" @loaded="failedUploads.delete(String(row.id))"/><span v-else>—</span></template></ElTableColumn>
    <ElTableColumn v-for="column in columns" :key="column" :label="labels[column]" :min-width="['preview_text','object_key'].includes(column)?320:140"><template #default="{row}">
     <ElSwitch v-if="column==='enabled'" :model-value="Number(row.enabled)" :active-value="1" :inactive-value="0" :disabled="!canEdit" :loading="switching.has(key(row))" @change="toggle(row)" />
     <ElTooltip v-else-if="resource==='categories'&&column==='name'&&access.accessCodes.includes('tts-relations:read')" content="查看音色" placement="right" :show-after="150"><ElButton class="category-entry" type="primary" plain :aria-label="`查看${row.name}分类下的音色`" @click="openCategory(row)"><span class="category-entry-name">{{ row.name }}</span><span class="category-entry-hint" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="12" width="4" height="9" rx="2"/><rect x="17" y="12" width="4" height="9" rx="2"/></svg></span></ElButton></ElTooltip>
     <CopyValue v-else-if="['audio_url','object_key','object_url','domain','upload_url'].includes(column)" :value="row[column]" :label="'复制'+labels[column]" /><span v-else style="white-space:pre-wrap;overflow-wrap:anywhere">{{ display(row,column) }}</span>
    </template></ElTableColumn>
    <ElTableColumn label="操作" width="250" fixed="right"><template #default="{row}"><CopyValue v-if="resource==='uploads'&&row.object_url" :value="row.object_url" label="复制链接"><span class="text-xs">复制链接</span></CopyValue><ElButton v-if="resource==='samples'" link :loading="previewing.has(key(row))" @click="playSample(row)">试听</ElButton><ElButton v-if="resource==='uploads'&&access.accessCodes.includes('storage-uploads:delete')&&(failedUploads.has(String(row.id))||!row.object_url)" link type="danger" :loading="deletingUploads.has(String(row.id))" @click="deleteUpload(row)">删除记录</ElButton><ElButton link @click="view(row)">详情</ElButton><ElButton v-if="canEdit&&!readonly" link type="primary" @click="edit(row)">编辑</ElButton><ElButton v-if="access.accessCodes.includes('tts-voices:preview')&&resource==='voices'" link :loading="previewing.has(String(row.id))" @click="preview(row)">生成试听</ElButton></template></ElTableColumn>
   </ElTable>
   <ElPagination v-model:current-page="page" :total="total" :page-size="20" layout="total, prev, pager, next, jumper, slot" class="mt-4" @current-change="load" style="justify-content:center;flex-wrap:wrap;row-gap:8px"><ElButton size="small" :disabled="page<=1" @click="page=1;load()">首页</ElButton><ElButton size="small" :disabled="page>=Math.max(1,Math.ceil((total)/(20)))" @click="page=Math.max(1,Math.ceil((total)/(20)));load()">末页</ElButton></ElPagination>
  </ElCard>
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
     <ElFormItem label="区域"><ElInput v-model="form.region"/></ElFormItem>
     <ElFormItem label="访问域名"><ElInput v-model="form.domain" placeholder="https://cdn.example.com"/></ElFormItem>
     <ElFormItem label="上传地址"><ElInput v-model="form.upload_url" placeholder="留空自动发现七牛上传区域"/></ElFormItem>
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
</style>
