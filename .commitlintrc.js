export default {
  extends: ['@vben/commitlint-config'],
  // 允许「修复后台」「1114」这类不带 type 的简短中文提交信息
  rules: {
    'type-empty': [0],
    'type-enum': [0],
    'subject-empty': [0],
  },
};
