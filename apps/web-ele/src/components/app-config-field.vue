<script setup lang="ts">
import { ref, watch } from 'vue';
import type { PropType } from 'vue';
import { ElButton, ElDatePicker, ElFormItem, ElInput, ElInputNumber, ElOption, ElRadio, ElRadioGroup, ElSelect, ElSwitch, ElTimePicker } from 'element-plus';
import type { ConfigField, ConfigValue } from '#/utils/app-config-layout';

// String 优先，防止 Vue 将代表‘跟随默认’的空字符串转换成 true。
const props=defineProps({
 field:{type:Object as PropType<ConfigField>,required:true},
 modelValue:{type:[String,Number,Boolean,Object] as PropType<ConfigValue>,default:undefined},
});
const emit=defineEmits<{'update:modelValue':[value:ConfigValue];'validity-change':[valid:boolean]}>();
const mappings=ref<{key:string;value:string}[]>([]);
const mappingError=ref('');
watch(()=>props.modelValue,value=>{
  if(props.field.control==='json'&&value&&typeof value==='object'){
    const entries=Object.entries(value).map(([key,item])=>({key,value:item}));
    if(JSON.stringify(Object.fromEntries(mappings.value.map(item=>[item.key,item.value])))!==JSON.stringify(value))mappings.value=entries;
  }
},{immediate:true});
function changeMappings(){
  const keys=mappings.value.map(item=>item.key);
  mappingError.value=keys.some(key=>!key.trim())?'请填写模板字段代码':new Set(keys).size!==keys.length?'模板字段不能重复':'';
  emit('validity-change',!mappingError.value);
  if(!mappingError.value)emit('update:modelValue',Object.fromEntries(mappings.value.map(item=>[item.key,item.value])));
}
function addMapping(){mappings.value.push({key:'',value:String(props.field.options?.[0]?.value??'')});changeMappings();}
function removeMapping(index:number){mappings.value.splice(index,1);changeMappings();}
// 月日没有年份，固定在闰年解析，避免 02-29 在当前非闰年被归一化成 03-01。
function calendarValue(){
  const value=String(props.modelValue||'');
  return props.field.format==='MM-DD'&&value?`2000-${value}`:value;
}
function changeCalendar(value:string|null){
  emit('update:modelValue',value?(props.field.format==='MM-DD'?value.slice(5):value):'');
}
</script>

<template>
 <ElFormItem :class="{'config-switch':field.control==='switch','config-default-output':field.key==='videoOutputMode'}" :label="field.label" :error="mappingError||undefined">
  <div class="config-field">
   <ElSwitch v-if="field.control==='switch'" :model-value="modelValue===true" @update:model-value="value=>emit('update:modelValue',Boolean(value))" />
   <ElInputNumber v-else-if="field.control==='number'" :model-value="typeof modelValue==='number'?modelValue:undefined" @update:model-value="value=>emit('update:modelValue',value??0)" />
   <ElRadioGroup v-else-if="field.control==='radio'" :model-value="typeof modelValue==='object'?undefined:modelValue" @update:model-value="value=>value!==undefined&&emit('update:modelValue',value)">
    <ElRadio v-for="option in field.options||[]" :key="String(option.value)" :value="option.value">{{option.label}}</ElRadio>
   </ElRadioGroup>
   <ElSelect v-else-if="field.control==='select'" :empty-values="[null,undefined]" :model-value="modelValue" @update:model-value="value=>emit('update:modelValue',value)">
    <ElOption v-for="option in field.options||[]" :key="String(option.value)" :label="option.label" :value="option.value" />
   </ElSelect>
   <ElTimePicker v-else-if="field.control==='time'&&field.format.startsWith('HH')" :model-value="String(modelValue||'')" :format="field.format" :value-format="field.format" @update:model-value="value=>emit('update:modelValue',value||'')" />
   <ElDatePicker v-else-if="field.control==='time'||field.control==='datetime'" :model-value="calendarValue()" :type="field.format.includes('HH')?'datetime':'date'" :format="field.format" :value-format="field.format==='MM-DD'?'YYYY-MM-DD':field.format" :default-value="field.format==='MM-DD'?new Date(2000,0,1):undefined" @update:model-value="changeCalendar" />
   <template v-else-if="field.control==='json'">
    <div v-for="(mapping,index) in mappings" :key="index" class="mb-2 flex gap-2">
     <ElInput v-model="mapping.key" placeholder="例如 thing1" @update:model-value="changeMappings" />
     <ElSelect v-if="field.options?.length" v-model="mapping.value" @update:model-value="changeMappings">
      <ElOption v-for="option in field.options" :key="String(option.value)" :label="option.label" :value="option.value"/>
     </ElSelect>
     <ElInput v-else v-model="mapping.value" placeholder="字段值" @update:model-value="changeMappings" />
     <ElButton @click="removeMapping(index)">移除</ElButton>
    </div>
    <ElButton @click="addMapping">添加字段</ElButton>
   </template>
   <ElInput v-else :model-value="String(modelValue??'')" :type="field.control==='textarea'?'textarea':'text'" maxlength="2000" @update:model-value="value=>emit('update:modelValue',value)" />
   <div v-if="field.description" class="config-description">{{field.description}}</div>
  </div>
 </ElFormItem>
</template>

<style scoped>
.config-field{width:100%;min-width:0}.config-description{margin-top:4px;color:var(--el-text-color-secondary);font-size:12px;line-height:1.5;white-space:pre-wrap}

.config-switch {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 12px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}
.config-switch :deep(.el-form-item__label) {
  height: auto;
  margin: 0;
  padding: 0;
  align-self: center;
  line-height: 1.5;
  overflow-wrap: anywhere;
  grid-area: 1 / 1;
}
.config-switch :deep(.el-form-item__content),
.config-switch .config-field {
  display: contents;
}
.config-switch :deep(.el-switch) {
  grid-area: 1 / 2;
  align-self: center;
}
.config-switch .config-description {
  grid-column: 1 / -1;
  margin: 0;
  overflow-wrap: anywhere;
}
.config-default-output {
  padding: 16px 20px;
  border: 1px solid var(--el-color-primary-light-5);
  border-left: 4px solid var(--el-color-primary);
  border-radius: 8px;
  background: var(--el-color-primary-light-9);
}
.config-default-output :deep(.el-form-item__label) {
  color: var(--el-color-primary);
  font-size: 15px;
  font-weight: 600;
}
.config-default-output .config-description {
  color: var(--el-text-color-regular);
}
</style>
