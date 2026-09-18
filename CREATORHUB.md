# CreatorHub 管理后台

本目录就是项目根目录，无额外vue-vben-admin外层。基于官方Vben Admin Element Plus，业务入口在apps/web-ele。

```powershell
cd D:\3-Vue\CreatorHub-Admin
pnpm dev
pnpm typecheck
pnpm build
```

开发访问：http://127.0.0.1:5777，仅监听本机。API通过同源/admin-api代理到http://127.0.0.1:8000。生产构建输出apps/web-ele/dist，需同域反代/admin-api并使用HTTPS。

使用后台管理员账号登录，不是微信用户账号。JWT只存内存，刷新凭证使用HttpOnly Cookie。管理端接口由Python项目提供，数据库是既有creator_hub。

首期：概览、用户、功能积分、奖励、积分套餐、会员套餐、会员权益、人工积分发放/会员开通、操作审计。

Python项目详细说明：D:/2-Pyhton/CreatorHub/docs/后台管理与数据库迁移.md。
接口文档：同目录admin-api_*.md，按ShowDoc格式。

密码重置：在Python项目执行 `.\.venv\Scripts\python.exe -m creatorhub.commands.manage_admin password --username admin`，终端隐藏输入，重置后所有旧会话失效。

保留官方LICENSE和工作区依赖结构。未执行git init、git add、commit或push。


## 完整后台模块

数据概览、用户、积分、会员、解析、视频任务、配音、存储、小程序配置、系统管理已接入。刷新或退出重新登录获取新增菜单。启用/禁用采用开关，权限不足时只读；编辑保存失败保留原状态。

完整使用说明：`D:/2-Pyhton/CreatorHub/docs/后台管理使用说明.md`。API文档：Python项目`docs/admin-api_*.md`。

配音示例生成、视频任务重试等可能产生调用费用或积分消耗，页面会先确认。微信支付和广告未接通，后台配置不等于开通服务。

启动步骤与 Vue 配置详见根目录 [使用说明](./使用说明.md)。
