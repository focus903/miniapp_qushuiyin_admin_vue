<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAccessStore } from '@vben/stores';
import { IconPicker } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { ElAlert, ElButton, ElCard, ElDialog, ElInput, ElMessage, ElMessageBox, ElOption, ElSelect, ElTag, ElTree } from 'element-plus';
import type { MenuGroup, MenuItem, MenuLayoutResult, MenuPage } from '#/utils/menu-layout';
import { normalizeLayout } from '#/utils/menu-layout';
import routes from '#/router/routes/modules/creatorhub';
import { requestClient } from '#/api/request';

const access = useAccessStore();
const canEdit = computed(() => access.accessCodes.includes('menu-layout:update'));
const items = ref<MenuItem[]>([]);
const revision = ref(0);
const ready = ref(false);
const busy = ref(false);
const dirty = ref(false);
const saved = ref(false);
const iconOpen=ref(false), iconTarget=ref(''), iconDraft=ref('');
const iconValid=computed(()=>iconDraft.value.trim().length<=100 && /^[a-zA-Z0-9:_-]*$/.test(iconDraft.value.trim()));
const iconOptions=computed(()=>[...new Set([
  'lucide:folder','lucide:users','lucide:user','lucide:video','lucide:file-text','lucide:link','lucide:coins','lucide:crown',
  'lucide:receipt','lucide:layout-dashboard','lucide:settings','lucide:shield-check','lucide:database','lucide:network',
  'lucide:audio-lines','lucide:image','lucide:star','lucide:history','lucide:list-tree','lucide:smartphone',
  ...items.value.flatMap(item=>[item.icon,...(item.kind==='group'?item.children.map(page=>page.icon):[])]).filter((icon):icon is string=>!!icon),
])]);
const groups = computed(() => items.value.filter((item): item is MenuGroup => item.kind === 'group'));
const disabled = computed(() => busy.value || !ready.value || !canEdit.value);
const label = (item: MenuItem) => item.label;
function changed() { dirty.value = true; saved.value = false; }
function findItem(id:string):MenuItem|undefined {
 return items.value.flatMap(item=>item.kind==='group'?[item,...item.children]:[item]).find(item=>item.id===id);
}
function editIcon(item:MenuItem) {
 if(disabled.value)return;
 iconTarget.value=item.id;iconDraft.value=item.icon??'';iconOpen.value=true;
}
function applyIcon() {
 if(disabled.value||!iconOpen.value||!iconValid.value)return;
 const item=findItem(iconTarget.value);
 if(!item){iconOpen.value=false;return;}
 const icon=iconDraft.value.trim();
 if((item.icon??'')!==icon){item.icon=icon;changed();}
 iconOpen.value=false;
}
function clearIcon(item:MenuItem) {
 if(disabled.value)return;
 const current=findItem(item.id);
 if(current?.icon){current.icon='';changed();}
}
function adopt(result: MenuLayoutResult) {
  revision.value = result.revision; ready.value = result.ready;
  items.value = normalizeLayout(routes, result.items); dirty.value = false; iconOpen.value=false;
}
async function load() {
  if (busy.value) return;
  if (dirty.value) {
    try { await ElMessageBox.confirm('重新加载将放弃未保存的调整，是否继续？', '重新加载'); } catch { return; }
  }
  busy.value = true;
  try { adopt(await requestClient.get<MenuLayoutResult>('/system/menu-layout')); saved.value = false; }
  finally { busy.value = false; }
}
async function save() {
  if (disabled.value) return;
  busy.value = true;
  try {
    try {
      await ElMessageBox.confirm('保存当前布局？所有管理员刷新页面后统一生效。', '保存全局布局');
    } catch { return; }
    const body = { revision: revision.value, items: JSON.parse(JSON.stringify(items.value)) };
    adopt(await requestClient.put<MenuLayoutResult>('/system/menu-layout', body));
    saved.value = true;
    ElMessage.success('已保存，刷新页面后菜单生效。');
  } finally { busy.value = false; }
}
async function editGroup(group?: MenuItem) {
  if (disabled.value) return;
  try {
    const result = await ElMessageBox.prompt('请输入分组名称（1～40字）', group ? '重命名菜单' : '新增分组', {
      inputValue: group?.label ?? '', inputValidator: value => !!value?.trim() && value.trim().length <= 40 || '请输入1～40字的名称',
    });
    if (disabled.value) return;
    if (group) group.label = result.value.trim();
    else items.value.push({ kind: 'group', id: `custom-${crypto.randomUUID()}`, label: result.value.trim(), icon: 'lucide:folder', children: [] });
    changed();
  } catch { /* 取消输入。 */ }
}
function removeGroup(group: MenuGroup) {
  if (disabled.value || group.children.length) return;
  items.value = items.value.filter(item => item.id !== group.id); changed();
}
function owner(id: string) { return groups.value.find(group => group.children.some(page => page.id === id))?.id ?? ''; }
function move(page: MenuPage, groupId: string) {
  if (disabled.value) return;
  const target = groupId ? groups.value.find(group => group.id === groupId) : undefined;
  if (groupId && !target) return;
  for (const group of groups.value) group.children = group.children.filter(item => item.id !== page.id);
  items.value = items.value.filter(item => item.id !== page.id);
  if (target) target.children.push(page); else items.value.push(page);
  changed();
}
function shift(item: MenuItem, delta: number) {
  if (disabled.value) return;
  const parent = item.kind === 'page' ? groups.value.find(group => group.children.some(page => page.id === item.id)) : undefined;
  const list: MenuItem[] = parent?.children ?? items.value;
  const index = list.findIndex(entry => entry.id === item.id);
  if (index + delta < 0 || index + delta >= list.length) return;
  list.splice(index + delta, 0, list.splice(index, 1)[0]!); changed();
}
type DragNode = { data: Record<string, unknown>; level: number };
function allowDrop(drag: DragNode, drop: DragNode, type: string) {
  if (disabled.value) return false;
  if (type === 'inner') return drag.data.kind === 'page' && drop.data.kind === 'group';
  return drag.data.kind === 'page' || drop.level === 1;
}
function refreshPage() { window.location.reload(); }
onMounted(load);
</script>

<template>
  <div class="p-4">
    <ElCard header="菜单管理">
      <ElAlert title="全局布局：拖动可调整顺序；页面可移入分组或一级菜单。只改变展示位置，原有页面权限保持有效。" type="info" :closable="false" class="mb-4" />
      <ElAlert v-if="!ready && !busy" title="菜单配置尚未就绪，请确认后端已更新并执行数据库迁移。" type="warning" :closable="false" class="mb-4" />
      <div class="mb-4 flex flex-wrap gap-2">
        <ElButton :disabled="disabled" @click="editGroup()">新增分组</ElButton>
        <ElButton type="primary" :disabled="disabled || !dirty" @click="save()">保存全局布局</ElButton>
        <ElButton :disabled="busy" @click="load">重新加载</ElButton>
        <ElButton v-if="saved" type="success" @click="refreshPage">刷新页面使菜单生效</ElButton>
        <ElTag v-if="dirty" type="warning">有未保存的调整</ElTag>
      </div>
      <ElTree :data="items" node-key="id" :props="{ label: (data) => label(data as MenuItem) }" default-expand-all :expand-on-click-node="false"
        :draggable="!disabled" :allow-drop="allowDrop" @node-drop="changed">
        <template #default="{ data }">
          <div class="menu-row">
            <span class="menu-title"><span class="mr-2 text-gray-400">⠿</span><IconifyIcon v-if="data.icon" :icon="data.icon" class="menu-current-icon" :title="data.icon" />{{ label(data) }}
              <ElTag v-if="data.kind === 'group'" class="ml-2" size="small">分组</ElTag>
            </span>
            <div class="menu-actions" @click.stop>
              <ElButton text size="small" :disabled="disabled" @click="shift(data, -1)">上移</ElButton>
              <ElButton text size="small" :disabled="disabled" @click="shift(data, 1)">下移</ElButton>
              <ElButton text size="small" :disabled="disabled" @click="editGroup(data)">重命名</ElButton>
              <ElButton text size="small" :disabled="disabled" @click="editIcon(data)">编辑图标</ElButton>
              <ElButton text size="small" :disabled="disabled || !data.icon" @click="clearIcon(data)">清空图标</ElButton>
              <template v-if="data.kind === 'group'">
                <ElButton text type="danger" size="small" :disabled="disabled || data.children.length > 0" title="只能删除空分组" @click="removeGroup(data)">删除空组</ElButton>
              </template>
              <ElSelect v-else :model-value="owner(data.id)" :disabled="disabled" size="small" style="width: 170px" aria-label="移动到分组" @change="move(data, $event)">
                <ElOption label="一级菜单" value="" />
                <ElOption v-for="group in groups" :key="group.id" :label="group.label" :value="group.id" />
              </ElSelect>
            </div>
          </div>
        </template>
      </ElTree>
    </ElCard>
    <ElDialog v-model="iconOpen" title="编辑菜单图标" width="min(520px,94vw)" destroy-on-close>
      <p class="mb-3 text-sm text-gray-500">选择常用图标，或输入图标名称；留空表示不显示图标。</p>
      <IconPicker v-model="iconDraft" prefix="" :auto-fetch-api="false" :icons="iconOptions" :disabled="disabled" />
      <ElInput v-model="iconDraft" class="mt-3" placeholder="例如 lucide:video" :maxlength="100" clearable :disabled="disabled" aria-label="图标名称" />
      <div class="menu-icon-preview"><span>预览：</span><IconifyIcon v-if="iconDraft.trim() && iconValid" :icon="iconDraft.trim()" class="size-6" /><span v-else>无图标</span></div>
      <ElAlert v-if="!iconValid" title="图标名称最多100个字符，仅支持字母、数字、冒号、下划线和短横线。" type="error" :closable="false" />
      <p class="mt-3 text-sm text-gray-500">应用后需点击“保存全局布局”，刷新页面后所有管理员统一生效。</p>
      <template #footer><ElButton @click="iconOpen=false">取消</ElButton><ElButton :disabled="disabled" @click="iconDraft=''">清空</ElButton><ElButton type="primary" :disabled="disabled || !iconValid" @click="applyIcon">应用</ElButton></template>
    </ElDialog>
  </div>
</template>

<style scoped>
.menu-row { display: flex; flex: 1; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; }
.menu-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-current-icon { display:inline-block; width:18px; height:18px; margin-right:8px; vertical-align:middle; }
.menu-icon-preview { display:flex; align-items:center; gap:8px; min-height:40px; margin-top:12px; }
.menu-actions { display: flex; flex-shrink: 0; align-items: center; gap: 4px; }
:deep(.el-tree-node__content) { height: 46px; border-bottom: 1px solid var(--el-border-color-lighter); }
@media (max-width: 640px) {
  .menu-row { align-items: flex-start; flex-direction: column; gap: 4px; padding: 6px 0; }
  :deep(.el-tree-node__content) { height: auto; min-height: 72px; }
}
</style>
