<script setup lang="ts">
import { ElButton, ElResult } from 'element-plus';
import { useAuthStore } from '#/store';
const auth=useAuthStore();
</script>
<template><div class="flex min-h-screen items-center justify-center"><ElResult icon="info" title="尚未分配页面权限" sub-title="请联系管理员为当前账号分配角色及查询权限，然后重新登录。"><template #extra><ElButton type="primary" @click="auth.logout(false)">返回登录</ElButton></template></ElResult></div></template>
