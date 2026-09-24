<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ElButton, ElInput, ElTree } from 'element-plus';
import { permissionLeaves, permissionNodes, selectedPermissions } from '#/utils/permission-tree';
import type { Permission } from '#/utils/permission-tree';
const props=defineProps<{modelValue:string[];permissions:Permission[]}>();
const emit=defineEmits<{ 'update:modelValue':[value:string[]] }>();
const tree=ref<InstanceType<typeof ElTree>>();
const search=ref('');
const nodes=computed(()=>permissionNodes(props.permissions,props.modelValue));
function change(){emit('update:modelValue',selectedPermissions(tree.value?.getCheckedKeys(true)||[],nodes.value));}
function filter(value:string,data:Record<string,unknown>){return !value||String(data.label||'').toLowerCase().includes(value.toLowerCase())||String(data.id||'').toLowerCase().includes(value.toLowerCase());}
watch(search,value=>tree.value?.filter(value));
async function sync(){await nextTick();tree.value?.setCheckedKeys(props.modelValue);tree.value?.filter(search.value);}
watch([()=>props.modelValue,()=>props.permissions],sync,{deep:true,immediate:true});
watch(tree,sync);
function all(){emit('update:modelValue',permissionLeaves(nodes.value));}
</script>
<template>
 <div class="permission-panel">
  <ElInput v-model="search" placeholder="搜索权限名称或代码" clearable aria-label="搜索权限" />
  <div class="permission-tools"><span>已选 {{modelValue.length}} 项权限</span><div><ElButton link type="primary" @click="all">全选</ElButton><ElButton link @click="emit('update:modelValue',[])">清空</ElButton></div></div>
  <ElTree ref="tree" :data="nodes" node-key="id" :props="{label:'label',children:'children'}" show-checkbox default-expand-all :expand-on-click-node="true" :filter-node-method="filter" empty-text="暂无权限" class="permission-nodes" @check="change" />
 </div>
</template>
<style scoped>
.permission-panel{width:100%}.permission-tools{display:flex;justify-content:space-between;align-items:center;margin:8px 0;color:var(--el-text-color-secondary);font-size:12px}.permission-nodes{max-height:360px;overflow:auto;border:1px solid var(--el-border-color);border-radius:6px;padding:8px}.permission-nodes :deep(.el-tree-node__content){height:34px}
</style>
