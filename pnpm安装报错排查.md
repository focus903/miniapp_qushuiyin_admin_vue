# pnpm 安装报错排查：Git 版本过低与 Node 版本不匹配

## 错误现象

在项目根目录执行 `pnpm i` 时，依赖安装和 `postinstall` 的 stub 构建已完成，但 `prepare` 阶段失败：

```text
. prepare$ is-ci || pnpm exec lefthook install
Git version is too old. Minimum supported version is 2.31.0
Config not found, creating...
Error: open --path-format=absolute/lefthook.yml: no such file or directory
ELIFECYCLE Command failed with exit code 1.
```

安装开始时还可能出现：

```text
Unsupported engine: wanted: {"node":"^22.18.0 || ^24.12.0"}
current: {"node":"v24.11.1","pnpm":"11.16.0"}
```

## 原因

### Git 版本过低导致 prepare 失败

本次排查发现，终端实际使用 `/usr/local/bin/git`，版本为 `2.21.0`。Lefthook 要求 Git 至少为 `2.31.0`。

旧 Git 不支持 `--path-format=absolute`。执行以下只读命令时，会把该参数原样输出：

```bash
git rev-parse --path-format=absolute --git-dir
```

这会让 Lefthook 得到错误的路径，最终尝试访问 `--path-format=absolute/lefthook.yml`。

项目根目录已有 `lefthook.yml`，无需重新创建。应升级实际被终端调用的 Git。

### Node 版本不满足项目要求

`package.json` 要求 Node 为 `^22.18.0 || ^24.12.0`，`v24.11.1` 不在范围内，因此出现版本警告。该警告不是本次 `prepare` 失败的直接原因，但仍应切换到项目支持的版本。

本次排查时，项目 `.node-version` 指定的版本为 `24.16.0`。

## 修复步骤（macOS）

以下命令在项目根目录执行。

### 1. 安装或升级 Git

使用 Homebrew 安装：

```bash
brew install git
```

如果 Homebrew 提示 Git 已安装，则执行：

```bash
brew upgrade git
```

让当前终端优先使用 Homebrew 安装的 Git，并刷新命令缓存：

```bash
export PATH="$(brew --prefix git)/bin:$PATH"
hash -r
command -v git
git --version
```

确认 Git 版本至少为 `2.31.0`。这次 PATH 调整只对当前终端生效；需要长期生效时，将上述 `export PATH=...` 配置加入所用 shell 的启动文件（例如 Bash 的 `~/.bash_profile` 或 Zsh 的 `~/.zshrc`），再打开新终端验证。

如果版本仍旧，可执行 `type -a git` 检查多个 Git 安装位置及命令覆盖情况。

### 2. 切换 Node 版本

如果已安装 nvm，可读取项目指定的版本：

```bash
nvm install "$(cat .node-version)"
nvm use "$(cat .node-version)"
node --version
pnpm --version
```

如果切换 Node 后找不到 pnpm，可安装项目声明的版本：

```bash
npm install -g pnpm@11.16.0
```

使用其他 Node 版本管理工具时，同样按 `.node-version` 切换即可。

### 3. 重新安装并验证

```bash
pnpm i
```

确认不再出现 Node engine 警告，且 `prepare` 中的 `lefthook install` 正常结束，安装命令以退出码 `0` 完成。

如需单独验证 Git hooks 安装，可执行：

```bash
pnpm exec lefthook install
```

本次问题无需修改业务代码，也无需删除 `pnpm-lock.yaml`、清理依赖或重新创建 `lefthook.yml`。

## 验证记录

已确认本次环境的 Git 版本为 `2.21.0`，并通过只读命令复现旧 Git 原样输出 `--path-format=absolute` 的行为。本文记录修复操作；是否修复成功，以目标机器升级后重新执行 `pnpm i` 的结果为准。

## 启动时报 Sass / macOS 版本错误

### 错误现象与原因

```text
VM initialization failed: Current Mac OS X version 13.0 is lower than minimum supported version 14.0
Pre-transform error: [sass] Tried writing to closed dispatcher
```

本次在 macOS 13.6.4 上复现：安装的 `sass-embedded@1.103.1` 内置 Dart VM 无法启动，随后 SCSS 编译出现 dispatcher 已关闭的错误。日志中的 `13.0` 不一定等于系统设置显示的完整版本。

### 项目修复

项目改用已安装的纯 JavaScript 版 `sass`，避免依赖上述 Dart VM：

- `internal/vite-config/src/config/application.ts` 从 `sass` 导入 `NodePackageImporter`。
- `internal/vite-config/package.json` 将 `sass-embedded` 改为 `npm:sass@1.103.1` 别名，让 Vite 解析该包名时使用纯 JavaScript 实现。
- 根目录 `package.json` 同样声明 `sass-embedded: npm:sass@1.103.1`，覆盖应用目录向上查找依赖时的解析入口。仅修改共享配置包不能覆盖这一入口。
- `pnpm-workspace.yaml` 移除 `sass-embedded` catalog 声明，并更新锁文件。
- 在 `pnpm-workspace.yaml` 的 `overrides` 中将 `sass-embedded` 指向 `npm:sass@1.103.1`，使依赖树中残留的可选 peer 同样使用纯 JavaScript 实现。

Vite 会优先选择可解析到的 `sass-embedded`，因此只修改导入语句不能解决问题，需要同步更新安装的依赖。

停止当前开发服务，应用修复后执行：

```bash
pnpm i
pnpm dev
```

重新打开页面，确认 SCSS 编译不再出现上述错误。无需修改日志中列出的 Vue 组件；纯 JavaScript 版 Sass 的编译速度可能低于 embedded 版本。

### 本次验证

已在 macOS 13.6.4、Node 24.16.0 下完成依赖更新和共享 Vite 配置重建，并通过 Vite 的 `preprocessCSS` 编译日志中报错的三个组件（count-to、json-viewer 和 header）。验证确认 Vite 解析到的 Sass 实现为 JavaScript 版本。完整页面仍需重启开发服务后检查。

随后实际运行开发服务时发现，应用向上查找依赖仍可能命中旧的 embedded 包，因而补充根目录的纯 JavaScript Sass 别名。最终通过 `pnpm dev --port 5788 --force` 启动服务，实际请求上述三个组件的样式模块，均返回 HTTP 200，未再出现 Dart VM 或 dispatcher 错误。依赖更新后，已有开发服务需先停止，再重新启动。
