# Git 提交检查开关说明

以下命令在管理后台项目根目录执行，适用于 Bash / Zsh 终端。

## 仅本次提交关闭全部 Lefthook 检查

```bash
LEFTHOOK=0 git commit -m "fix: 修复菜单兼容与配置检查"
```

本次提交跳过 Lefthook 的提交前检查和提交信息检查，下次提交恢复正常。
此命令不会自动暂存文件，请先按需执行 `git add`。

## 长期关闭当前仓库的 Lefthook 自动检查

```bash
pnpm exec lefthook uninstall
```

卸载当前本地仓库已安装的 Lefthook Git 钩子，后续提交不再自动运行这些检查。
该操作保留 `lefthook.yml`，不会修改其他开发者或其他仓库的配置。

项目的 `prepare` 脚本会执行 `lefthook install`。后续安装依赖触发该脚本时，钩子可能被重新安装；需要继续关闭时，再执行卸载命令。

## 恢复自动检查

```bash
pnpm exec lefthook install
```

恢复后，按根目录 `lefthook.yml` 中的配置执行检查。

## 只关闭提交时的类型检查

在根目录 `lefthook.yml` 中注释整个 `checkType` 任务：

```yaml
    # - name: checkType
    #   run: pnpm --filter @vben/web-ele run typecheck
```

这样仍会执行 Oxlint、Oxfmt、ESLint、Stylelint 和提交信息检查。
取消这两行的注释即可恢复类型检查。当前配置的类型检查仅针对 `web-ele` 管理后台应用。

## 已经在运行的检查

配置修改或卸载钩子不会停止已经启动的检查。请在正在执行 `git commit` 的终端按 **Ctrl+C** 中止，再重新提交。

关闭自动检查后，仍可手动执行管理后台类型检查：

```bash
pnpm --filter @vben/web-ele run typecheck
```
