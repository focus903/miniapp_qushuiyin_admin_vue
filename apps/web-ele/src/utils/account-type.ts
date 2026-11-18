/** 账号类型统一配置：来自 users.development（tinyint 0=普通用户，1=开发者）。 */
export const ACCOUNT_TYPES = [
  { value: '0', label: '普通用户' },
  { value: '1', label: '开发者' },
] as const;

export type AccountTypeValue = (typeof ACCOUNT_TYPES)[number]['value'];

/** 把 development（数字 / 布尔 / 字符串）归一为配置里的值。 */
export function accountTypeValue(value: unknown): AccountTypeValue {
  return value === true || Number(value) === 1 ? '1' : '0';
}

/** 统一展示名称。 */
export function accountTypeLabel(value: unknown): string {
  const target = accountTypeValue(value);
  return ACCOUNT_TYPES.find((item) => item.value === target)?.label ?? '';
}
