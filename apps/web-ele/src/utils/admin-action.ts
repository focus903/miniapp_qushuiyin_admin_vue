export function adminActionLabel(value:unknown):string {
 return ({
  'proxy-pool.delete':'删除代理','proxy-pool.delete-failed':'删除失效代理',
  'proxy-pool.custom.create':'新增自定义代理','proxy-pool.custom.update':'编辑自定义代理','proxy-pool.custom.import':'导入自定义代理',
  'config.packages.reorder':'调整充值套餐排序',
  'config.membership-plans.reorder':'调整会员套餐排序',
  'config.entitlements.reorder':'调整套餐权益排序',
  'users.delete':'永久删除用户','users.delete_failed':'删除用户失败',
  'users.login-record.region-recheck':'补查登录 IP 归属地','users.login-records.delete':'删除登录记录',
  'storage.upload.delete':'删除上传记录',
  'points.grant':'人工发放积分','points.deduct':'人工扣除积分','membership.grant':'人工开通会员','membership.cancel':'人工取消会员',
  'task.retry':'重试视频任务','task.cancel':'取消视频任务','parses.delete':'删除解析记录','parses.restore':'恢复解析记录',
  'auth.login':'管理员登录','auth.login_failed':'管理员登录失败','auth.logout':'管理员退出',
  'admin.create':'创建管理员','system.admin.save':'保存管理员','system.role.save':'保存角色权限',
  'system.sessions.revoke':'注销管理员会话','system.app-config.save':'修改小程序配置',
  'config.create':'新增业务配置','config.update':'修改业务配置',
  'catalog.create':'新增目录配置','catalog.update':'修改目录配置','catalog.preview':'生成或获取音色试听',
  'catalog.relation.batch.add':'批量添加分类音色','catalog.relation.batch.remove':'批量移除分类音色',
  'catalog.relation.remove':'移除分类音色','catalog.relation.reorder':'调整分类音色排序',
 } as Record<string,string>)[String(value)]||String(value||'');
}
