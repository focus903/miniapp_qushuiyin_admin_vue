<script setup lang="ts">
import type { PropType } from 'vue';

import type {
  AdFreeScene,
  ConfigField,
  ConfigValue,
} from '#/utils/app-config-layout';

import { ref, watch } from 'vue';

import {
  ElButton,
  ElDatePicker,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElOption,
  ElRadio,
  ElRadioGroup,
  ElSelect,
  ElSwitch,
  ElTimePicker,
} from 'element-plus';

// String 优先，防止 Vue 将代表‘跟随默认’的空字符串转换成 true。
const props = defineProps({
  field: { type: Object as PropType<ConfigField>, required: true },
  modelValue: {
    type: [String, Number, Boolean, Object] as PropType<ConfigValue>,
    default: undefined,
  },
});
const emit = defineEmits<{
  'update:modelValue': [value: ConfigValue];
  validityChange: [valid: boolean];
}>();
const mappings = ref<{ key: string; value: string }[]>([]);
const mappingError = ref('');
watch(
  () => props.modelValue,
  (value) => {
    if (props.field.control === 'json' && value && typeof value === 'object') {
      const entries = Object.entries(value).map(([key, item]) => ({
        key,
        value: String(item ?? ''),
      }));
      if (
        JSON.stringify(
          Object.fromEntries(
            mappings.value.map((item) => [item.key, item.value]),
          ),
        ) !==
        JSON.stringify(
          Object.fromEntries(entries.map((item) => [item.key, item.value])),
        )
      )
        mappings.value = entries;
    }
  },
  { immediate: true },
);
function changeMappings() {
  const keys = mappings.value.map((item) => item.key);
  if (keys.some((key) => !key.trim()))
    mappingError.value = '请填写模板字段代码';
  else if (new Set(keys).size === keys.length) {
    mappingError.value = '';
  } else {
    mappingError.value = '模板字段不能重复';
  }
  emit('validityChange', !mappingError.value);
  if (!mappingError.value)
    emit(
      'update:modelValue',
      Object.fromEntries(mappings.value.map((item) => [item.key, item.value])),
    );
}
function addMapping() {
  mappings.value.push({
    key: '',
    value: String(props.field.options?.[0]?.value ?? ''),
  });
  changeMappings();
}
function removeMapping(index: number) {
  mappings.value.splice(index, 1);
  changeMappings();
}
function freeValue(): Record<string, boolean> {
  return props.modelValue && typeof props.modelValue === 'object'
    ? (props.modelValue as Record<string, boolean>)
    : {};
}
function freeGroups(): { name: string; items: AdFreeScene[] }[] {
  const groups = new Map<string, { name: string; items: AdFreeScene[] }>();
  for (const scene of props.field.scenes || []) {
    const group = groups.get(scene.group) || { name: scene.group, items: [] };
    group.items.push(scene);
    groups.set(scene.group, group);
  }
  return [...groups.values()];
}
function toggleFree(key: string, value: boolean) {
  // 关闭时直接过滤掉该键，避免动态 delete 与残留的 false 值。
  const next: Record<string, boolean> = Object.fromEntries(
    Object.entries(freeValue()).filter(([item]) => item !== key),
  );
  if (value) next[key] = true;
  emit('update:modelValue', next);
}
// 月日没有年份，固定在闰年解析，避免 02-29 在当前非闰年被归一化成 03-01。
function calendarValue() {
  const value = String(props.modelValue || '');
  return props.field.format === 'MM-DD' && value ? `2000-${value}` : value;
}
function changeCalendar(value: null | string) {
  if (!value) {
    emit('update:modelValue', '');
    return;
  }
  // 月日格式去掉补齐的年份，其余格式原样保存。
  const next = props.field.format === 'MM-DD' ? value.slice(5) : value;
  emit('update:modelValue', next);
}
</script>

<template>
  <ElFormItem
    :class="{
      'config-switch': field.control === 'switch',
      'config-default-output': field.key === 'videoOutputMode',
    }"
    :label="field.label"
    :error="mappingError || undefined"
  >
    <template #label>
      <slot name="label">{{ field.label }}</slot>
    </template>
    <div class="config-field">
      <ElSwitch
        v-if="field.control === 'switch'"
        :model-value="modelValue === true"
        @update:model-value="
          (value) => emit('update:modelValue', Boolean(value))
        "
      />
      <ElInputNumber
        v-else-if="field.control === 'number'"
        :model-value="typeof modelValue === 'number' ? modelValue : undefined"
        @update:model-value="(value) => emit('update:modelValue', value ?? 0)"
      />
      <ElRadioGroup
        v-else-if="field.control === 'radio'"
        :model-value="typeof modelValue === 'object' ? undefined : modelValue"
        @update:model-value="
          (value) => value !== undefined && emit('update:modelValue', value)
        "
      >
        <ElRadio
          v-for="option in field.options || []"
          :key="String(option.value)"
          :value="option.value"
        >
          {{ option.label }}
        </ElRadio>
      </ElRadioGroup>
      <ElSelect
        v-else-if="field.control === 'select'"
        :empty-values="[null, undefined]"
        :model-value="modelValue"
        @update:model-value="(value) => emit('update:modelValue', value)"
      >
        <ElOption
          v-for="option in field.options || []"
          :key="String(option.value)"
          :label="option.label"
          :value="option.value"
        />
      </ElSelect>
      <ElTimePicker
        v-else-if="field.control === 'time' && field.format.startsWith('HH')"
        :model-value="String(modelValue || '')"
        :format="field.format"
        :value-format="field.format"
        @update:model-value="(value) => emit('update:modelValue', value || '')"
      />
      <ElDatePicker
        v-else-if="field.control === 'time' || field.control === 'datetime'"
        :model-value="calendarValue()"
        :type="field.format.includes('HH') ? 'datetime' : 'date'"
        :format="field.format"
        :value-format="field.format === 'MM-DD' ? 'YYYY-MM-DD' : field.format"
        :default-value="
          field.format === 'MM-DD' ? new Date(2000, 0, 1) : undefined
        "
        @update:model-value="changeCalendar"
      />
      <template v-else-if="field.key === 'adFreeFeatures'">
        <div
          v-if="field.description"
          class="config-description config-free-hint"
        >
          {{ field.description }}
        </div>
        <div
          v-for="group in freeGroups()"
          :key="group.name"
          class="config-free-group"
        >
          <div class="config-free-title">{{ group.name }}</div>
          <div
            v-for="item in group.items"
            :key="item.key"
            class="config-free-row"
          >
            <div class="config-free-meta">
              <span class="config-free-name">{{ item.name }}</span>
              <span class="config-free-key">{{ item.key }}</span>
              <span class="config-free-cost">{{
                item.enabled
                  ? `${item.points} 积分 / ${item.unitSize}${item.unitLabel}`
                  : '未启用计费'
              }}</span>
            </div>
            <ElSwitch
              size="small"
              :model-value="freeValue()[item.key] === true"
              @update:model-value="
                (value) => toggleFree(item.key, Boolean(value))
              "
            />
          </div>
        </div>
        <div v-if="!field.scenes?.length" class="config-free-empty">
          暂无功能配置，请先初始化功能费用表。
        </div>
      </template>
      <template v-else-if="field.control === 'json'">
        <div
          v-for="(mapping, index) in mappings"
          :key="index"
          class="mb-2 flex gap-2"
        >
          <ElInput
            v-model="mapping.key"
            placeholder="例如 thing1"
            @update:model-value="changeMappings"
          />
          <ElSelect
            v-if="field.options?.length"
            v-model="mapping.value"
            @update:model-value="changeMappings"
          >
            <ElOption
              v-for="option in field.options"
              :key="String(option.value)"
              :label="option.label"
              :value="option.value"
            />
          </ElSelect>
          <ElInput
            v-else
            v-model="mapping.value"
            placeholder="字段值"
            @update:model-value="changeMappings"
          />
          <ElButton @click="removeMapping(index)">移除</ElButton>
        </div>
        <ElButton @click="addMapping">添加字段</ElButton>
      </template>
      <ElInput
        v-else
        :model-value="String(modelValue ?? '')"
        :type="field.control === 'textarea' ? 'textarea' : 'text'"
        maxlength="2000"
        @update:model-value="(value) => emit('update:modelValue', value)"
      />
      <div
        v-if="field.description && field.key !== 'adFreeFeatures'"
        class="config-description"
      >
        {{ field.description }}
      </div>
    </div>
  </ElFormItem>
</template>

<style scoped>
.config-field {
  width: 100%;
  min-width: 0;
}

.config-description {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  white-space: pre-wrap;
}

.config-free-hint {
  margin: 0 0 4px;
}

.config-free-group {
  margin-top: 4px;
}

.config-free-title {
  padding: 2px 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.config-free-row {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: flex-start;
  padding: 2px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.config-free-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.config-free-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.config-free-key {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.config-free-cost {
  font-size: 12px;
  color: var(--el-color-primary);
}

.config-free-empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.config-switch {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 12px;
  padding: 14px 16px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.config-switch :deep(.el-form-item__label) {
  grid-area: 1 / 1;
  align-self: center;
  height: auto;
  padding: 0;
  margin: 0;
  line-height: 1.5;
  overflow-wrap: anywhere;
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
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-5);
  border-left: 4px solid var(--el-color-primary);
  border-radius: 8px;
}

.config-default-output :deep(.el-form-item__label) {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.config-default-output .config-description {
  color: var(--el-text-color-regular);
}
</style>
