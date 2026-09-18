<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import { AuthenticationLogin, z } from '@vben/common-ui';
import { useAuthStore } from '#/store';
const authStore = useAuthStore();
const formSchema: VbenFormSchema[] = [
  {component: 'VbenInput', fieldName: 'username', label: '管理员账号', componentProps: {placeholder: '请输入管理员账号'}, rules: z.string().min(3)},
  {component: 'VbenInputPassword', fieldName: 'password', label: '密码', componentProps: {placeholder: '请输入密码'}, rules: z.string().min(1)},
];
</script>
<template><AuthenticationLogin :form-schema="formSchema" :loading="authStore.loginLoading" :show-code-login="false" :show-qrcode-login="false" :show-register="false" :show-forget-password="false" :show-third-party-login="false" :show-remember-me="false" @submit="authStore.authLogin" /></template>
