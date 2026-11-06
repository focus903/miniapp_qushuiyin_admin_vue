# 管理后台前端 CI/CD：从零搭建操作手册

更新日期：2026-10-29。按这次实际搭建顺序编写，供下一次从头操作，而不是只介绍最终架构。

**阅读方式：从第 1 步开始依次操作。每一阶段先看作用，再按“建分支 → 改文件 → 提交推送 → 创建 PR → 检查 → 合并 → 验收”完成后，才进入下一阶段。**

当前仓库已经搭建完成，本文用于复现和查阅，不要在现有站点重复初始化。新项目需要统一替换仓库名、域名、目录、SSH 用户、端口和证书路径；不要把示例中的真实项目路径误用到其他业务站点。

## 操作路线

| 顺序 | 本阶段分支或操作位置 | 完成标志 |
| --- | --- | --- |
| 1 | 本地仓库与 GitHub Actions 页面 | 确认 master、环境、现有文件和操作方式 |
| 2 | ci/admin-workflow | PR 与 master 的类型检查、测试、构建通过 |
| 3 | test/ci-failure-demo | 故意错误变红，修复后变绿；关闭测试 PR |
| 4 | ci/upload-artifac（或 ci/upload-artifact） | master 成功运行可下载构建产物 |
| 5 | 服务器、DNS、Nginx | 手动上传后网页和登录可用 |
| 6 | 自己电脑、服务器、GitHub Secrets | 专用密钥登录成功，5 个 Secret 完成 |
| 7 | ci/deploy-admin-test | Actions 手动输入 run_id 完成发布 |
| 8 | ci/auto-deploy-test | 合并后无需点击，CI 成功自动发布 |
| 9 | ci/versioned-deploy + 服务器 | Nginx 使用 current，发布保留 previous |
| 10 | ci/rollback-admin-test | 网页手动回滚，链接交换且首页验证通过 |
| 11 | GitHub Rulesets 设置 | 保存 Active 的 protect-master |
| 12 | test/ruleset-block | CI 失败时合并按钮真正被禁用 |
| 13 | 日常功能分支、文档分支 | 团队通过 PR 持续开发和发布 |

## 1. 起点：先准备本地仓库和确认操作方式

本次对象是 GitHub 仓库 focus903/miniapp_qushuiyin_admin_vue，主分支 master，管理后台应用包 @vben/web-ele。以下所有 git / pnpm 命令在管理后台仓库根目录执行；注明服务器的命令在 Linux 测试服务器执行。

1. 如果是新电脑，先克隆：

```bash
git clone git@github.com:focus903/miniapp_qushuiyin_admin_vue.git
cd miniapp_qushuiyin_admin_vue
```

已有本地仓库直接进入即可，不重复克隆。

2. 执行 git status，确认分支和工作区；未提交的修改先自行保存，不运行 reset --hard 清空工作。
3. 确认根目录 package.json 的 packageManager 和 .node-version；按其声明安装 pnpm 和 Node。不要沿用另一项目的版本。
4. 确认现有 `.github/workflows/ci.yml`、`.github/actions/setup-node/action.yml`、应用源码和测试文件存在。本文基于当前项目，不适用于空仓库直接复制路径。
5. 在 GitHub 打开仓库 Actions；若页面提示启用工作流，先启用。初始原模板任务可能因仓库名限制而跳过，下一步会替换它。

后续每个阶段都可以选择本地或 GitHub 网页操作，不要同时编辑同一文件后忘记同步。

**本地方式：**

1. 在管理后台仓库根目录执行 git status，先保存或处理未提交修改。
2. 切换 master 并拉取最新代码。
3. 从最新 master 新建该阶段的分支。
4. 修改指定文件，提交并推送该分支。
5. 在 GitHub 创建 PR，base 为 master，compare 为刚推送的分支。
6. 等最新检查通过，审阅后合并。
7. 同步本地 master，再进行下一个阶段。

**网页方式：**

1. 仓库 Code 页选择 master，打开本阶段要修改的文件。
2. 点铅笔编辑；新增文件用 Add file → Create new file。
3. 点击 Commit changes，填本阶段的提交信息。
4. 选择 Create a new branch for this commit and start a pull request，输入本阶段分支名。
5. 点击 Propose changes，再到下一页点击 Create pull request。
6. 同一个 PR 后续要继续修改时，先切换到该功能分支，编辑后选择 Commit directly to 此功能分支，不再新建分支。
7. 检查通过后合并，下一阶段重新从 master 创建新分支。

网页提交已经进远程；回到本地继续开发前，应先拉取相应分支的新提交。

## 2. 第一次配置 CI：ci/admin-workflow

**目的：**让自己的仓库真正执行 CI，先完成类型检查、指定测试和构建。此阶段还没有产物上传、SSH 发布和回滚。

**步骤一：新建分支。** 本地执行：

```bash
git status
git switch master
git pull --ff-only origin master
git switch -c ci/admin-workflow
```

**步骤二：打开并替换 `.github/workflows/ci.yml`。** 初始可运行版本如下，已采用本次后来修正的 Action 和 Ubuntu 版本，不必重新使用旧版再经历弃用警告：

```yaml
name: Admin CI

on:
  pull_request:
  push:
    branches:
      - master
      - main
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: admin-ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

env:
  CI: true
  LEFTHOOK: '0'
  TZ: Asia/Shanghai

jobs:
  check:
    name: Web-ele checks
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - name: Checkout code
        uses: actions/checkout@v5

      - name: Setup Node and dependencies
        uses: ./.github/actions/setup-node

      - name: Typecheck web-ele
        run: pnpm --filter @vben/web-ele run typecheck

      - name: Test configuration and menus
        run: |
          node --test \
            apps/web-ele/tests/*config.test.mjs \
            apps/web-ele/src/utils/menu-layout.test.mjs \
            apps/web-ele/src/views/creatorhub/__tests__/menu-layout.test.mjs \
            apps/web-ele/src/views/creatorhub/__tests__/menu-icons.test.mjs

      - name: Build web-ele
        run: pnpm --filter @vben/web-ele run build
```

这样替换后，任务不再受 `github.repository == 'vbenjs/vue-vben-admin'` 限制，也不再并行检查所有演示应用和多个操作系统。

**步骤三：在同一个分支调整 `.github/actions/setup-node/action.yml`。**

- 保留原有环境安装步骤，Node 读取 `.node-version`，pnpm 读取 packageManager。
- 使用本仓库最终文件中的 `actions/cache@v5` 和 `actions/cache/restore@v5`。
- 把本仓库缓存分支判断 `== 'main'` 和 `!= 'main'` 分别改成 master。
- 外部 URL 中的 main 不是本仓库分支，不做批量替换。
- 附录 C附有当前组合 Action 的完整内容，可核对复制。

本次学习中，这些修正继续提交到了 ci/admin-workflow，PR #8 因此包含多个提交；无需每改一行就建新分支或新 PR。

**步骤四：提交与推送。**

```bash
git add .github/workflows/ci.yml .github/actions/setup-node/action.yml
git commit -m "ci: 添加管理后台自动检查"
git push -u origin ci/admin-workflow
```

**步骤五：创建 PR。**

1. 打开 GitHub 仓库 → Pull requests → New pull request；也可点 Code 页黄色的 Compare & pull request。
2. base 选 master，compare 选 ci/admin-workflow。
3. 标题填写 `ci: 添加管理后台自动检查`，描述填写类型检查、测试、构建的范围。
4. 点 Create pull request，等待 Web-ele checks 变绿。
5. 打开检查日志，确认不是被 if 条件跳过；查看 Typecheck、Test、Build 三步。

**步骤六：合并并验证 master。**

1. 回到 PR 的 Conversation，点 Merge pull request → Confirm merge。
2. Actions → Admin CI，找到 master 分支、事件为 push 的新运行。
3. 等待该运行通过。本次最初主分支验收记录是 Admin CI #13；编号只是当时的计数，不是固定值。

若停留在运行详情页，点击左上角 Back to pull request 返回 PR；不要把旧的 CI 运行页当成 PR 页面。

## 3. 故意提交错误：test/ci-failure-demo

**目的：**证明 CI 确实会检查类型，不是只显示一个没有实际检查的绿色状态。此时尚未配置 Rulesets，CI 失败也可能仍能点合并。

```bash
git switch master
git pull --ff-only origin master
git switch -c test/ci-failure-demo
```

新建 `apps/web-ele/src/ci-failure-demo.ts`：

```ts
export const ciFailureDemo: number = '故意制造类型错误';
```

```bash
git add apps/web-ele/src/ci-failure-demo.ts
git commit -m "test: 验证 CI 能检测类型错误"
git push -u origin test/ci-failure-demo
```

创建 `master ← test/ci-failure-demo` 的 PR。仅推送测试分支不够，必须打开 PR。确认 Typecheck 报 TS2322，提示 string 不能赋给 number。

在同一个分支把文件改为：

```ts
export const ciFailureDemo: number = 123;
```

```bash
git add apps/web-ele/src/ci-failure-demo.ts
git commit -m "test: 修复演练中的类型错误"
git push
```

原 PR 自动更新，CI 应恢复绿色。不需要为修复再建一个 PR。验证完成后 Close pull request，不合并临时测试文件。

## 4. 保存构建产物：ci/upload-artifac

**目的：**把“构建成功”升级为“构建出一个可下载、可发布的固定产物”。只改 CI，不连接服务器。

本次对话中实际填写的是 `ci/upload-artifac`（少一个 t）。下面按这个实际名字给出命令；若你使用完整的 ci/upload-artifact，所有命令和 PR compare 都使用完整名字即可，二选一。

```bash
git switch master
git pull --ff-only origin master
git switch -c ci/upload-artifac
```

编辑 `.github/workflows/ci.yml`，在 Build web-ele 后增加：

```yaml
      - name: Upload web-ele build
        uses: actions/upload-artifact@v6
        with:
          name: web-ele-dist-${{ github.sha }}
          path: apps/web-ele/dist/
          if-no-files-found: error
          retention-days: 7
```

```bash
git add .github/workflows/ci.yml
git commit -m "ci: 保存管理后台构建产物"
git push -u origin ci/upload-artifac
```

创建 `master ← ci/upload-artifac` 的 PR。CI 通过后，打开本次运行的 Summary，确认 Artifacts 中存在 web-ele-dist-…，可下载，解压后直接有 index.html 和静态资源。

确认后合并 PR，再验证 master 的运行也有产物。以后部署使用 master push 的产物，不使用 PR 的产物。

## 5. 在服务器搭建测试站：本阶段不建分支

### 5.1 准备域名、目录和初始产物

本阶段在服务器和 DNS 控制台操作，不改 Git 代码。以下使用本次的测试域名和目录；在新项目复现时统一替换为自己的值。

1. 在 DNS 添加 A 记录：主机名 admin-test，值为测试服务器公网 IP。
2. 准备覆盖该域名的 HTTPS 证书，确认 HTTP/HTTPS 服务可达。
3. 在服务器创建目录：

```bash
sudo mkdir -p /home/wwwroot/MediaForge/creatorhub-admin-test
```

4. 在 GitHub 的 master Admin CI 成功记录中，打开 Summary → Artifacts，下载 web-ele-dist-… 压缩包。
5. 用自己现有的 SSH 文件传输工具上传到服务器，例如本地执行以下 scp，替换文件路径和服务器 IP：

```bash
scp -P 22 /本地实际路径/构建产物.zip ubuntu@服务器公网IP:/tmp/admin-test.zip
```

6. 在服务器解压，确认不要多套一层 dist：

```bash
sudo unzip -o /tmp/admin-test.zip -d /home/wwwroot/MediaForge/creatorhub-admin-test
ls -l /home/wwwroot/MediaForge/creatorhub-admin-test/index.html
```

如果没有 unzip，先用 sudo apt-get install -y unzip 安装。scp 示例中的公网 IP 和实际本地 zip 路径必须自行替换。

域名 `admin-test.linggandu.site` 应解析到测试服务器，HTTPS 证书应覆盖该域名。

本次使用的证书路径为：

```nginx
ssl_certificate /root/.acme.sh/admin-test.linggandu.site/fullchain.cer;
ssl_certificate_key /root/.acme.sh/admin-test.linggandu.site/admin-test.linggandu.site.key;
```

证书路径不是证书内容。不要将私钥、SSH 私钥或真实密码提交到 Git。

### 5.2 配置初始 Nginx 站点

编辑服务器上该域名已经存在的站点配置，不要额外创建重复 server。保留现有 acme.sh 续期所需的 location 或 include。

```nginx
server {
    listen 80;
    server_name admin-test.linggandu.site;

    return 301 https://admin-test.linggandu.site$request_uri;
}

server {
    listen 443 ssl;
    server_name admin-test.linggandu.site;

    ssl_certificate /root/.acme.sh/admin-test.linggandu.site/fullchain.cer;
    ssl_certificate_key /root/.acme.sh/admin-test.linggandu.site/admin-test.linggandu.site.key;

    root /home/wwwroot/MediaForge/creatorhub-admin-test;
    index index.html;

    location /admin-api/ {
        proxy_pass http://127.0.0.1:8002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

注意 `proxy_pass http://127.0.0.1:8002;` 不带 URI 和末尾 `/`，保留原请求中的 `/admin-api/` 前缀。

修改配置后执行：

```bash
sudo nginx -t && sudo nginx -s reload
```

这里先使用平铺目录。到第 9 步才备份网站、创建 current，并把 root 改成 current；不要提前指向不存在的链接。

### 5.3 配置接口并验收登录

测试接口服务的 `.env` 应包含或追加：

```dotenv
ADMIN_ALLOWED_ORIGINS=https://admin-test.linggandu.site
ADMIN_COOKIE_SECURE=true
```

已有其他允许域名时用逗号分隔，不要覆盖仍在使用的配置。修改后按该 Python 服务原有方式重启；前端发布工作流不代替这一步。

验收应同时检查页面打开和后台登录。仅首页可访问，不代表 `/admin-api/` 代理和鉴权都正常。

## 6. 配置部署连接：本地密钥、服务器公钥、GitHub Secrets

### 6.1 在开发者电脑生成部署专用密钥

```bash
mkdir -p ~/.ssh
ssh-keygen -t ed25519 \
  -C "github-actions-admin-test" \
  -f ~/.ssh/creatorhub_admin_test
```

本次配置使用无密码的部署专用私钥，两次密码提示直接回车。若文件已存在，不要覆盖已有密钥。

| 文件 | 用途 |
| --- | --- |
| `~/.ssh/creatorhub_admin_test` | 私钥，放到 GitHub Secret |
| `~/.ssh/creatorhub_admin_test.pub` | 公钥，放到服务器 ubuntu 用户下 |

### 6.2 将公钥安装到服务器

开发者电脑执行：

```bash
cat ~/.ssh/creatorhub_admin_test.pub
```

以 ubuntu 登录服务器：

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
```

将公钥完整追加一行，保留已有公钥。保存后执行：

```bash
chmod 600 ~/.ssh/authorized_keys
```

从开发者电脑测试：

```bash
ssh -i ~/.ssh/creatorhub_admin_test \
  -o IdentitiesOnly=yes \
  -p 22 ubuntu@服务器公网IP
```

将示例 IP 替换为实际 IP。首次连接时核对服务器指纹；确认不需要服务器密码即可登录。

### 6.3 目录权限与 rsync

服务器执行：

```bash
sudo mkdir -p /home/wwwroot/MediaForge/creatorhub-admin-test
sudo chown -R ubuntu:ubuntu /home/wwwroot/MediaForge/creatorhub-admin-test
sudo chmod -R u+rwX,go+rX,go-w /home/wwwroot/MediaForge/creatorhub-admin-test
```

这里只调整专用测试站目录，不要扩大到整个 `/home/wwwroot`。

测试写权限：

```bash
touch /home/wwwroot/MediaForge/creatorhub-admin-test/.deploy-check
rm /home/wwwroot/MediaForge/creatorhub-admin-test/.deploy-check
```

检查 rsync；缺少时安装：

```bash
rsync --version
# 仅在未安装时执行：
sudo apt-get update
sudo apt-get install -y rsync
```

### 6.4 配置 Repository Secrets

入口：仓库 Settings → Secrets and variables → Actions → Secrets → New repository secret。

如果菜单位置不同，可打开：

```text
https://github.com/focus903/miniapp_qushuiyin_admin_vue/settings/secrets/actions
```

| Name | Secret 值 |
| --- | --- |
| `TEST_SSH_HOST` | 服务器公网 IP，不带 `http://` 或端口 |
| `TEST_SSH_USER` | `ubuntu` |
| `TEST_SSH_PORT` | `22` |
| `TEST_SSH_PRIVATE_KEY` | 部署专用私钥的完整内容，包含 BEGIN / END 行 |
| `TEST_SSH_KNOWN_HOSTS` | 服务器 IP、主机公钥类型和主机公钥，保持一行 |

在可信的服务器会话中获取主机公钥：

```bash
sudo cat /etc/ssh/ssh_host_ed25519_key.pub
```

`TEST_SSH_KNOWN_HOSTS` 格式：

```text
服务器公网IP ssh-ed25519 AAAA...后面是完整公钥
```

这里用的是服务器主机公钥，不是前面生成的部署用户公钥。当前说明针对 22 端口；若以后改端口，known_hosts 的主机格式也需相应调整。

工作流开启 `StrictHostKeyChecking yes`，不通过关闭主机校验来绕过错误。服务器重装、更换主机密钥或地址时，应核对后更新相应 Secret。

完成本步骤后，应有以下结果：

- 自己电脑用专用私钥能以 ubuntu 登录服务器，不需要服务器密码。
- ubuntu 能写测试目录，服务器有 rsync。
- GitHub Repository Secrets 页面有全部 5 个名称。

这些设置不需要创建新 Git 分支，不要把真实私钥加入任何提交。确认后才进行第 7 步。


## 7. 第一次手动部署：ci/deploy-admin-test

**目的：**不再手工 curl 下载、解压，而是在 GitHub 页面指定构建，让工作流完成发布。

```bash
git switch master
git pull --ff-only origin master
git switch -c ci/deploy-admin-test
```

新建 `.github/workflows/deploy-admin-test.yml`。若逐阶段复现，先使用附录 C.3提供的“初始手动部署版”，其行为为：

- 只有 workflow_dispatch 手动入口，要求填写 run_id。
- 只允许从 master 手动运行。
- RUN_ID 直接取 inputs.run_id。
- 下载并校验成功的 master push 构建。
- 配置 SSH 后，将 site/ 上传到平铺目录。
- 验证网站首页与产物一致。

```bash
git add .github/workflows/deploy-admin-test.yml
git commit -m "ci: 添加测试站手动部署"
git push -u origin ci/deploy-admin-test
```

创建 `master ← ci/deploy-admin-test` 的 PR。检查通过后合并，本次对应 PR #11。文件进入 master 后，Actions 左侧才出现可使用的 Deploy Admin Test 手动入口。

**合并后立即做第一次手动发布验收：**

用途：重新部署某次构建，或明确选择一个仍未过期的历史 master 产物。

1. 打开 Actions → Admin CI。
2. 选择成功、事件为 push、分支为 master 的运行。
3. 确认 Summary 中存在构建产物。
4. 从浏览器网址获取运行 ID，例如：

```text
https://github.com/.../actions/runs/40798426628
                                      ↑ 运行 ID
```

5. 打开 Actions → Deploy Admin Test → Run workflow。
6. 分支选 master，run_id 填第 4 步的数字。
7. 点击 Run workflow。
8. 查看 Download verified build、Upload and activate release、Verify deployed page 是否通过。
9. 访问测试站，并在服务器检查链接：

```bash
cd /home/wwwroot/MediaForge/creatorhub-admin-test
ls -l current previous
```

以下编号不要混淆：

| 名称 | 示例 / 获取位置 | 用途 |
| --- | --- | --- |
| PR 编号 | PR #8 | 标识合并请求 |
| 工作流运行序号 | Admin CI #19 | 列表显示的计数 |
| 运行 ID | `/actions/runs/` 后的大整数 | 手动部署输入 run_id |
| 提交 SHA | 完整 40 位提交号 | 标识构建代码版本 |
| Artifact ID | 上传日志或产物 API | 用 API 下载单个产物，不用于 run_id |

手动选择旧运行会实际发布旧代码，不是只查看日志。GitHub 产物过期或删除后，此下载方式会失败。

注意：本阶段成功只能说明手动发布链路通，不代表以后每次 CI 成功都会自动发布。

## 8. 改成自动部署：ci/auto-deploy-test

**目的：**让 master 的 CI 成功后自动发布，保留原来的手动选版本入口。

```bash
git switch master
git pull --ff-only origin master
git switch -c ci/auto-deploy-test
```

只编辑 `.github/workflows/deploy-admin-test.yml` 的三处：

**第一处：on 下增加自动触发，保留手动触发：**

```yaml
on:
  workflow_run:
    workflows: ['Admin CI']
    types: [completed]
    branches: [master]
  workflow_dispatch:
    inputs:
      run_id:
        description: '已通过的 master Admin CI 运行 ID'
        required: true
        type: string
```

**第二处：deploy 任务条件：**

```yaml
    if: >-
      github.ref == 'refs/heads/master' &&
      (
        github.event_name == 'workflow_dispatch' ||
        (
          github.event.workflow_run.conclusion == 'success' &&
          github.event.workflow_run.event == 'push'
        )
      )
```

**第三处：下载步骤的环境变量：**

```yaml
          RUN_ID: ${{ github.event.workflow_run.id || inputs.run_id }}
```

```bash
git add .github/workflows/deploy-admin-test.yml
git commit -m "ci: 主分支检查通过后自动部署测试站"
git push -u origin ci/auto-deploy-test
```

创建 PR，检查通过后合并。等待此次 master 的 Admin CI 成功，再查看 Deploy Admin Test 是否自动出现新的运行，不点击 Run workflow。部署实际执行并验证成功后，本阶段完成。

## 9. 改成版本目录部署：ci/versioned-deploy

**目的：**上传完整的新版本后再切换入口，并保留旧版本供回滚。

**步骤一：先在服务器建立版本入口。** 准备期间不要穿插其他 master 发布，以免旧的平铺部署和新的 Nginx root 不一致。

当前项目已完成本步骤，不要重复运行。新服务器按本手册复现时，此时站点应仍在平铺目录中。

以 ubuntu 用户执行：

```bash
bash <<'SH'
set -euo pipefail
SITE=/home/wwwroot/MediaForge/creatorhub-admin-test
RELEASE="initial-$(date -u +%Y%m%dT%H%M%SZ)"

test -s "$SITE/index.html"
test ! -e "$SITE/current"
test ! -L "$SITE/current"
mkdir -p "$SITE/releases/$RELEASE"

rsync -a \
  --exclude='/releases/' \
  --exclude='/current' \
  "$SITE/" "$SITE/releases/$RELEASE/"

test -s "$SITE/releases/$RELEASE/index.html"
ln -s "releases/$RELEASE" "$SITE/current"
readlink -f "$SITE/current"
ls -l "$SITE/current/index.html"
SH
```



服务器完成初始化后，将第 5 步站点配置的 root 替换成：

```nginx
root /home/wwwroot/MediaForge/creatorhub-admin-test/current;
```

```bash
sudo nginx -t && sudo nginx -s reload
```

再次打开测试站和登录，确认网站正常。此时 current 指向备份版本；previous 会在第一次版本化发布时创建。


**步骤二：在功能分支改造上传动作。**

然后在本地：

```bash
git switch master
git pull --ff-only origin master
git switch -c ci/versioned-deploy
```

编辑 `.github/workflows/deploy-admin-test.yml`：

1. 找到整个 `Upload test site` 步骤。
2. 替换为附录 C.4最终部署文件里的 `Upload and activate release` 步骤。
3. 替换范围是从该步骤的 `- name:` 开始到下一个步骤之前，不只替换 rsync 命令。
4. 前面的 Configure SSH 和后面的 Verify deployed page 保留。

```bash
git add .github/workflows/deploy-admin-test.yml
git commit -m "ci: 使用版本目录部署测试站"
git push -u origin ci/versioned-deploy
```

创建 PR，检查通过后合并。等待 master CI 和自动部署完成。在服务器执行：

```bash
cd /home/wwwroot/MediaForge/creatorhub-admin-test
ls -l current previous
```

确认 current 指向本次新建的 releases 版本，previous 指向部署前的版本，且网站正常。本次已验证此流程。

## 10. 增加回滚按钮：ci/rollback-admin-test

**目的：**发生问题时，不重新构建、不在服务器手工改链接，通过 Actions 切回上一版。

```bash
git switch master
git pull --ff-only origin master
git switch -c ci/rollback-admin-test
```

新建 `.github/workflows/rollback-admin-test.yml`，内容见附录 C.5完整快照。

```bash
git add .github/workflows/rollback-admin-test.yml
git commit -m "ci: 添加测试站手动回滚"
git push -u origin ci/rollback-admin-test
```

创建 PR，检查通过后合并。合并本身仍会触发正常 master CI 和自动部署；它不会触发回滚。

**合并后等待正常自动部署完成，再进行回滚演练：**

1. 打开 Actions → Rollback Admin Test。
2. 点击 Run workflow。
3. 分支选 master。
4. 勾选“确认将测试站回滚到 previous 版本”。
5. 点击 Run workflow。
6. 等待 Switch to previous release 和 Verify rolled-back page 通过。
7. 打开测试站并验证功能。
8. 在服务器执行：

```bash
cd /home/wwwroot/MediaForge/creatorhub-admin-test
ls -l current previous
```

如果页面要求填写 run_id，你打开的是部署工作流，应取消并切换到 Rollback Admin Test。



```text
回滚前：current → B，previous → A
回滚后：current → A，previous → B
```

工作流验证两个链接均指向 releases 内有 index.html 的版本，然后交换它们。回滚后再次运行，可恢复到刚才的版本，前提是期间没有其他部署改变链接。

验证步骤从服务器读取 current/index.html，再与域名实际返回的首页比较。它仍是首页一致性检查，不是完整业务验收。

在 Actions 查看两步均通过，在浏览器验证站点。回滚只切换前端静态文件，不修改 Git 主分支、Python 或数据库。验证失败时不会自动撤销切换，先看链接和日志，不要连续反复点击。


## 11. 启用主分支保护：在 GitHub 设置中配置 Rulesets

本步骤修改仓库设置，不需要创建 Git 分支。

### 11.1 确认账号支持

CI 负责发现问题；Rulesets 负责禁止不符合要求的代码进入 master。CD 的成功条件也会阻止 CI 失败的代码自动发布，但不能代替主分支保护。

先进入 Settings → Rulesets，确认当前仓库和套餐支持强制执行。本次私有仓库页面曾提示不会生效，所以改成公有仓库做演练；新项目不需要为了照抄教程必须公开业务代码，可以使用支持私有规则的套餐或单独的公有练习仓库。

若确定要公开并已检查敏感信息：Settings → General → 页面底部 Danger Zone → Change repository visibility → Change visibility → Public → 按提示确认。回到 Rulesets 检查不再提示无法强制执行。

套餐和仓库类型的支持范围以 GitHub 当前官方说明及设置页面为准。

仓库公开会公开代码、可访问的 Git 历史和 Actions 日志。Secrets 值不会因为仓库公开自动显示在设置页面，但已经写入代码或日志的敏感内容可能泄露；公开前应检查历史内容。改回私有不能收回已经被复制的内容。

### 11.2 创建并保存规则

入口：仓库 Settings → Rulesets → New ruleset → New branch ruleset。

| 设置 | 本次选择 |
| --- | --- |
| Ruleset name | protect-master |
| Enforcement status | Active |
| Bypass list | 空 |
| Target branches | Include by pattern：master |
| Require a pull request before merging | 勾选 |
| Required approvals | 0，适合当前单人演练 |
| Require status checks to pass | 勾选 |
| Required status checks | Web-ele checks，来源 GitHub Actions |
| Require branches to be up to date before merging | 勾选 |
| Do not require status checks on creation | 不勾选 |
| Block force pushes | 勾选 |

当前无需配置 Code Owners、代码扫描、覆盖率或 Copilot 审核作为合并条件。多人项目可按分工增加审核要求，设置为 1 后需要其他有资格的审核人批准，作者不能自己批准自己的 PR。

添加状态检查时选择具体任务 `Web-ele checks`，不是工作流名字 `Admin CI`。不要把合并后才运行的部署任务设为 PR 的必需检查，否则可能形成互相等待。

不要勾选 Restrict updates 来代替“必须走 PR”；该选项是另一类更严格的更新限制。

点击 Create / Save changes 保存，确认规则确实为 Active。Rulesets 不负责自动合并。

## 12. 验证规则：test/ruleset-block

先保证工作区干净，再在独立测试分支操作：

```bash
git switch master
git pull --ff-only origin master
git switch -c test/ruleset-block
```

新建 `apps/web-ele/src/ruleset-demo.ts`：

```ts
export const rulesetDemo: number = '故意制造类型错误';
```

```bash
git add apps/web-ele/src/ruleset-demo.ts
git commit -m "test: 验证规则集阻止错误代码合并"
git push -u origin test/ruleset-block
```

若本地钩子阻止本次故意错误的演练提交，可仅这次用：

```bash
LEFTHOOK=0 git commit -m "test: 验证规则集阻止错误代码合并"
```

创建到 master 的 PR，等待 CI 失败，确认：

- Typecheck 报 `string` 不能赋给 `number`；
- Web-ele checks 标记 Required；
- Merge pull request 禁用；
- 若分支落后于主分支，另外要求 Update branch。

这才说明不仅检测到了错误，还真正禁止了合并。本次已完成该演练。

验证后关闭测试 PR，不合并。若误在日常功能分支加入了测试文件，删除它并提交，避免污染后续开发：

```bash
git rm apps/web-ele/src/ruleset-demo.ts
git commit -m "test: 移除规则集演练文件"
git push
```

本次实际操作时，日志显示错误提交在 feat/lyf，而不是建议的 test/ruleset-block。两种分支都能触发 PR 检查，但清理时必须在真正包含演练文件的分支删除文件并提交。

**预期结果：**CI 失败、标记 Required、合并按钮禁用。修复后可验证重新变绿；仅演练的 PR 最后关闭，不合并。

## 13. 搭建完成后的日常开发和分支清理

### 13.1 开始新功能

在仓库根目录执行：

```bash
git status
```

工作区有改动时先自行处理，不要用 reset --hard 强行清空。工作区干净后：

```bash
git switch master
git pull --ff-only origin master
git switch -c feat/本次功能名
```

功能分支用完后，下一项功能建议从更新后的 master 新建分支，不要长期重复使用已合并的分支。

### 13.2 提交、推送和创建 PR

```bash
git add 具体修改的文件
git commit -m "feat: 描述本次修改"
git push -u origin feat/本次功能名
```

GitHub 上点击 Compare & pull request；没有黄色快捷提示也正常，可手动进入 Pull requests → New pull request。

确认 base 为 master、compare 为自己的功能分支。填写标题和修改说明，点击 Create pull request。

推送不等于创建 PR，PR 创建不等于合并；本地 commit 也不等于已经推送。

### 13.3 同步别人合并的主分支代码

先保存并提交当前功能修改，然后在自己的功能分支执行：

```bash
git fetch origin
git merge origin/master
```

若有冲突，编辑并解决冲突，再执行：

```bash
git add 已解决的冲突文件
git commit
git push
```

也可以用 PR 页面的 Update branch 同步。使用网页更新后，下次继续本地开发前先拉取对应功能分支的新提交，避免推送被拒绝。

“将 master 合并进功能分支”用于同步代码，不触发部署；“将功能分支的 PR 合并进 master”才进入主分支发布流程。

### 13.4 合并和发布验收

1. PR 的最新提交 CI 通过。
2. 按 Rulesets 要求同步主分支并重新检查。
3. 审阅 Files changed，确认修改符合预期。
4. 点击 Merge pull request → Confirm merge。
5. 等待 master 的 Admin CI 成功。
6. 等待 Deploy Admin Test 自动触发且部署任务实际执行成功。
7. 访问测试站，验证页面、登录和本次业务变更。

Rulesets 生效且没有绕过权限时，不能继续使用直接 push master 的发布习惯，应走上述 PR 流程。

### 13.5 对话中的文档分支和个人分支

**docs/git-hooks-guide：**对话中建议用来单独提交本地检查文档，操作示例：

```bash
git switch master
git pull --ff-only origin master
git switch -c docs/git-hooks-guide
git add Git提交检查开关说明.md
git commit -m "docs: 添加 Git 提交检查开关说明"
git push -u origin docs/git-hooks-guide
```

创建到 master 的 PR；检查后合并。当前工作流没有路径过滤，所以只改文档也会触发 CI，合并后还会部署测试站。

**feat/lyf：**对话中你实际使用过的个人功能分支。推送到这里不会让 master 的 Code 页面显示该分支最新文件。要查看它，应切换分支；要进入主分支，应新建或更新目标 master 的 PR。

此前 PR #15 已合并后，又往 feat/lyf 推送了新提交，并不代表旧的已合并 PR 会重新打开。这次新改动要创建新的 PR。长期工作建议每个功能从更新后的 master 创建新的 feat/具体功能名，避免个人大分支积累历史和演练文件。

### 13.6 每一阶段完成后的同步与清理

确认本阶段 PR 已合并后，在本地同步主分支：

```bash
git switch master
git pull --ff-only origin master
```

再从这里执行下一阶段的 git switch -c。这样下一阶段能包含上一阶段的流水线配置。

可选清理已经结束的分支：

```bash
# 例：该 PR 已合并，且确认没有未发布工作后：
git branch -d ci/admin-workflow
# GitHub PR 页也可以点击 Delete branch 删除对应远程分支。
```

若采用 squash/rebase 合并，本地 -d 可能认为分支没有合并；先核对 PR 和差异，不要为了消除提示立即使用 -D。测试 PR 关闭后也应先确认没有实际功能代码，再删除其分支。

删除已合并的 ci/ 配置分支不会删除 master 中的 workflow，也不会关闭已经启用的自动部署。回滚按钮也不依赖保留 ci/rollback-admin-test 分支，它读取 master 上的工作流文件。

## 14. 可选：配置本地提交检查

本地 Lefthook 与 GitHub CI 是两套独立机制。卸载本地钩子不会关闭远端 CI 或 Rulesets。

临时跳过本次提交的 Lefthook：

```bash
LEFTHOOK=0 git commit -m "docs: 更新说明文档"
```

当前仓库卸载 / 恢复钩子：

```bash
pnpm exec lefthook uninstall
pnpm exec lefthook install
```

这是两个相反的操作，按需执行其中一个。项目 prepare 脚本可能在后续安装依赖时重新安装钩子。

本地的类型检查任务已缩小为 web-ele：

```yaml
- name: checkType
  run: pnpm --filter @vben/web-ele run typecheck
```

若只想关闭本地提交时的类型检查，可注释整个任务；完整说明见 [Git提交检查开关说明.md](Git提交检查开关说明.md)。

当前远端尚未接入本地四项 lint / 格式 / 样式检查，不能把关闭本地检查解释成已经有等价的云端覆盖。

## 15. 运行结果不符合预期时如何排查

| 现象 | 排查和处理 |
| --- | --- |
| Code 页看不到新提交 | 检查当前看的是否是 master；推到 feat/lyf 的代码需切换到该分支看 |
| 没有 Compare & pull request 提示 | 这是快捷入口，不保证每次出现；手动 New pull request 即可 |
| 推送功能分支后没有 CI | 当前只监听 PR 和指定主分支 push；确认 PR 已打开 |
| CI 灰色跳过 | 看任务条件，原模板可能只允许 vbenjs/vue-vben-admin 运行 |
| Semantic Pull Request 跳过 | 原模板任务未改造，不等同于 Web-ele checks 失败 |
| PR 检查通过却没有部署 | PR 不部署；需合并 master，且 master push 的 CI 成功 |
| CI 失败但能合并 | 检查规则是否 Active、目标分支和检查名、仓库套餐支持及绕过名单 |
| Required check 一直等待 | 是否错误添加 Admin CI 而非 Web-ele checks，或把部署设成合并前必需条件 |
| Branch is out-of-date | Update branch 或本地 merge origin/master，然后等检查重跑 |
| 手动发布下载失败 | run_id 是否为网址中的运行 ID；检查是否 master push 成功运行、产物名是否匹配、是否过期 |
| Permission denied (publickey) | 核对私钥完整性、公钥是否放在 ubuntu 下、用户和端口及 authorized_keys 权限 |
| Host key verification failed | 核对 TEST_SSH_KNOWN_HOSTS 的 IP、主机公钥和端口格式；不要关闭主机验证 |
| rsync 找不到 | 在服务器安装 rsync |
| mkdir / rsync Permission denied | 确认 ubuntu 可写测试目录及 releases；不要使用 chmod 777 解决 |
| 首次部署 test -L current 失败 | 尚未初始化 current，按第 9 步处理 |
| 页面 403 / 静态资源权限错误 | 检查 Nginx 用户对父目录和版本目录是否有读取、遍历权限 |
| 502 / 登录失败 | 检查 Python 8002 服务、/admin-api/ 代理、允许来源及 Cookie 设置 |
| 验证 cmp 失败 | 检查 root 是否指向 current、CDN/缓存是否返回旧页面、上传产物是否对应本次运行 |
| 部署变红但网站已经更新 | 切换可能已完成，查看 current；验证失败不会自动回滚 |
| 回滚后网站仍像新版 | 查看链接、浏览器缓存以及两个版本是否本来就没有页面差异；不要只凭外观判断 |
| 回滚后又出现新版 | 后续成功的 master CI 可能触发了自动部署，检查 Actions 时间线 |
| index.html 中还有旧接口地址 | 确认生产构建时的前端环境配置；修改构建时变量通常需重新构建，改服务器静态目录外的 .env 不会自动生效 |

排查服务器当前版本：

```bash
cd /home/wwwroot/MediaForge/creatorhub-admin-test
ls -l current previous
readlink -f current
ls -l current/index.html
```

检查 Nginx 与页面响应：

```bash
sudo nginx -t
curl -I https://admin-test.linggandu.site/
```

查看具体失败步骤的日志，区分下载、SSH、上传、切换和验证失败，不要仅凭工作流整体颜色判断服务器状态。

## 附录 A：之前每一个分支名及其作用

分支只是用于隔离一组修改，名字本身不会开启 CI、部署或回滚；真正决定行为的是 workflow 的触发条件。除 master 外，下面这些都不是必须长期保留的环境分支。

| 分支名 | 用来做什么 | 修改内容 | 如何结束 |
| --- | --- | --- | --- |
| `master` | 团队共享主分支，也是当前测试站自动发布来源 | 通过 PR 接收审核和检查后的代码 | 长期保留，不删除 |
| `ci/admin-workflow` | 第一次接入自己的前端 CI | 替换原 Vben 的 ci.yml，调整安装环境和缓存；在同一分支修正 Action 版本、master 分支判断和 Ubuntu 版本 | 本次 PR #8 已合并；确认无需继续使用后可删除 |
| `test/ci-failure-demo` | 验证 CI 能发现错误，以及修复后能重新变绿 | 临时新增 ci-failure-demo.ts，先制造类型错误，再修复 | 关闭演练 PR，不合并，可删除分支 |
| `ci/upload-artifact` | 给 CI 增加构建产物保存 | ci.yml 末尾增加 Upload web-ele build | 合并后可删除 |
| `ci/upload-artifac` | 上一项在本次对话中实际填写的拼写，末尾少 t | 与上一项完全相同，不是第二套功能 | 按实际名字创建 PR，不需要为了拼写再建同名用途的分支 |
| `ci/deploy-admin-test` | 接通第一次手动部署 | 新增 deploy-admin-test.yml，从指定成功的 master CI 下载并发布产物 | 本次 PR #11 已合并；合并后可删除 |
| `ci/auto-deploy-test` | 从手动发布升级为 CI 成功后自动发布 | 在部署文件中增加 workflow_run、成功判断和自动 RUN_ID | 合并后可删除 |
| `ci/versioned-deploy` | 从平铺覆盖上传升级为独立版本目录发布 | 替换上传步骤，保存 previous 并切换 current；服务器配套调整 Nginx root | 合并且验证发布后可删除 |
| `ci/rollback-admin-test` | 增加网页上的手动回滚入口 | 新增 rollback-admin-test.yml | 合并后可删除；网页工作流仍保留 |
| `docs/git-hooks-guide` | 单独提交本地提交检查开关说明 | Git提交检查开关说明.md | 文档 PR 合并后可删除 |
| `feat/lyf` | 个人日常功能分支，对话中实际用于业务修改和后来的规则演练 | 日常修改；本次还误放入 ruleset-demo.ts 的故意错误 | 先清理演练文件，再按 PR 处理实际功能；不建议长期重复使用已合并的分支 |
| `test/ruleset-block` | 推荐用于隔离 Rulesets 拦截演练的分支名 | 临时新增 ruleset-demo.ts 的类型错误 | 关闭演练 PR，不合并，可删除；本次实际提交到了 feat/lyf |

上述名称包含对话中实际出现的名字和建议使用的名字，不表示远程目前一定存在所有这些分支。

前缀约定：`ci/` 表示流水线配置修改，`test/` 表示演练，`docs/` 表示文档，`feat/` 表示功能。Git 不强制这些前缀，团队可以自行约定。

## 附录 B：完成标准和当前边界

### B.1 当前已验证

- [x] PR 自动检查、类型测试失败变红。
- [x] 修复类型错误后重新检查通过。
- [x] master 成功构建并保存产物。
- [x] 手动部署指定 master 产物。
- [x] master CI 通过后自动部署。
- [x] 上传到独立版本目录后切换 current。
- [x] 域名返回首页与产物一致性验证。
- [x] 手动交换 current / previous 回滚并验证。
- [x] Rulesets 将 Web-ele checks 设为 Required，失败时禁止合并。

这些是本次搭建中观察到的结果，不保证未来任意提交或环境变化都自动通过。

### B.2 尚未实现

- CI 中的 Oxlint、格式、ESLint 和 Stylelint 检查。
- 自动业务端到端测试、完整覆盖率要求。
- 发布失败后的自动回滚与失败通知。
- releases 版本保留数量及磁盘清理。
- 任意历史版本选择、自动阻止旧 CI 产物覆盖较新发布。
- 原子发布后的旧页面继续加载旧哈希资源的专门处理：旧版本仍在 releases 中，但 current 切换后旧资源不一定能通过同一 URL 访问，浏览器打开的旧页面可能需要刷新。
- 正式环境部署、独立生产密钥和人工审批。
- Python 后端、工作节点和数据库迁移的 CI/CD。

清理历史版本前必须保护 current 和 previous 指向的目录。暂不提供自动删除命令，避免误删可回滚版本。

### B.3 参考资料

- [GitHub：工作流事件与 workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
- [GitHub CLI：下载运行产物](https://cli.github.com/manual/gh_run_download)
- [GitHub：Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [GitHub：仓库可见性变更](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
- [Nginx：proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)

## 附录 C：各阶段完整配置

以下是写本文时核对的配置，供逐步搭建和离线查阅。仓库中的实际 workflow 文件仍是后续维护的唯一执行来源。所有含 ${{ ... }} 的内容都是 GitHub 表达式，应原样保留，不要替换成真实密钥。

### C.1 最终 ci.yml

路径：`.github/workflows/ci.yml`。与第 2 步相比，增加了产物上传步骤。

```yaml
name: Admin CI

on:
  pull_request:
  push:
    branches:
      - master
      - main
  workflow_dispatch:

permissions:
  contents: read

# 同一分支再次提交时，取消旧的检查，避免重复消耗资源。
concurrency:
  group: admin-ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

env:
  CI: true
  LEFTHOOK: '0'
  TZ: Asia/Shanghai

jobs:
  check:
    name: Web-ele checks
    runs-on: ubuntu-24.04
    timeout-minutes: 30

    steps:
      - name: Checkout code
        uses: actions/checkout@v5

      # 复用项目已有配置，安装 Node、pnpm 和锁定依赖。
      - name: Setup Node and dependencies
        uses: ./.github/actions/setup-node

      - name: Typecheck web-ele
        run: pnpm --filter @vben/web-ele run typecheck

      - name: Test configuration and menus
        run: |
          node --test \
            apps/web-ele/tests/*config.test.mjs \
            apps/web-ele/src/utils/menu-layout.test.mjs \
            apps/web-ele/src/views/creatorhub/__tests__/menu-layout.test.mjs \
            apps/web-ele/src/views/creatorhub/__tests__/menu-icons.test.mjs

      - name: Build web-ele
        run: pnpm --filter @vben/web-ele run build

      - name: Upload web-ele build
        uses: actions/upload-artifact@v6
        with:
          name: web-ele-dist-${{ github.sha }}
          path: apps/web-ele/dist/
          if-no-files-found: error
          retention-days: 7
```

### C.2 最终 setup-node/action.yml

路径：`.github/actions/setup-node/action.yml`。第 2 步即应核对的组合 Action。

```yaml
name: 'Setup Node'

description: 'Setup node and pnpm'

runs:
  using: 'composite'
  steps:
    - name: Install pnpm
      uses: pnpm/action-setup@v6

    - name: Install Node.js
      uses: actions/setup-node@v6
      with:
        node-version-file: .node-version
        cache: 'pnpm'

    - name: Get pnpm store directory
      shell: bash
      run: |
        echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

    - uses: actions/cache@v5
      name: Setup pnpm cache
      if: ${{ github.ref_name == 'master' }}
      with:
        path: ${{ env.STORE_PATH }}
        key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
        restore-keys: |
          ${{ runner.os }}-pnpm-store-

    - uses: actions/cache/restore@v5
      if: ${{ github.ref_name != 'master' }}
      with:
        path: ${{ env.STORE_PATH }}
        key: |
          ${{ runner.os }}-pnpm-store-

    - name: Install dependencies
      shell: bash
      run: pnpm install --frozen-lockfile
```

### C.3 初始手动部署版（只用于按阶段复现）

路径：`.github/workflows/deploy-admin-test.yml`。这是根据本次最终配置还原的第 7 步的教学版本，上传目标是最外层平铺目录，没有自动触发和版本入口切换。仅在新环境按本章顺序复现时使用；现有版本化部署站点不要切回此版本，否则 Nginx current 与上传目录不一致。

```yaml
name: Deploy Admin Test

on:
  workflow_dispatch:
    inputs:
      run_id:
        description: '已通过的 master Admin CI 运行 ID（运行页面网址中的数字）'
        required: true
        type: string

permissions:
  contents: read
  actions: read

# 同一时间只执行一次测试站部署。
concurrency:
  group: deploy-admin-test
  cancel-in-progress: false

jobs:
  deploy:
    name: Deploy to test site
    if: github.ref == 'refs/heads/master'
    runs-on: ubuntu-24.04
    timeout-minutes: 15

    steps:
      - name: Download verified build
        env:
          GH_TOKEN: ${{ github.token }}
          GH_REPO: ${{ github.repository }}
          RUN_ID: ${{ inputs.run_id }}
        shell: bash
        run: |
          set -euo pipefail

          [[ "$RUN_ID" =~ ^[0-9]+$ ]]

          gh api "repos/$GH_REPO/actions/runs/$RUN_ID" > run.json

          # 只接受当前仓库 master 分支成功的 CI 推送构建。
          jq -e '
            .conclusion == "success" and
            .head_branch == "master" and
            .event == "push" and
            .path == ".github/workflows/ci.yml"
          ' run.json > /dev/null

          BUILD_SHA=$(jq -r '.head_sha' run.json)

          gh run download "$RUN_ID" \
            --repo "$GH_REPO" \
            --name "web-ele-dist-$BUILD_SHA" \
            --dir site

          test -s site/index.html

          echo "Deploying commit: $BUILD_SHA"
          echo "BUILD_SHA=$BUILD_SHA" >> "$GITHUB_ENV"

      - name: Configure SSH
        env:
          DEPLOY_HOST: ${{ secrets.TEST_SSH_HOST }}
          DEPLOY_USER: ${{ secrets.TEST_SSH_USER }}
          DEPLOY_PORT: ${{ secrets.TEST_SSH_PORT }}
          DEPLOY_KEY: ${{ secrets.TEST_SSH_PRIVATE_KEY }}
          KNOWN_HOSTS: ${{ secrets.TEST_SSH_KNOWN_HOSTS }}
        shell: bash
        run: |
          set -euo pipefail

          test -n "$DEPLOY_HOST"
          test -n "$DEPLOY_USER"
          test -n "$DEPLOY_PORT"
          test -n "$DEPLOY_KEY"
          test -n "$KNOWN_HOSTS"

          install -d -m 700 ~/.ssh
          printf '%s\n' "$DEPLOY_KEY" > ~/.ssh/admin_test_key
          printf '%s\n' "$KNOWN_HOSTS" > ~/.ssh/known_hosts
          chmod 600 ~/.ssh/admin_test_key ~/.ssh/known_hosts

          cat > ~/.ssh/config <<EOF
          Host admin-test-deploy
              HostName $DEPLOY_HOST
              User $DEPLOY_USER
              Port $DEPLOY_PORT
              IdentityFile ~/.ssh/admin_test_key
              IdentitiesOnly yes
              StrictHostKeyChecking yes
              BatchMode yes
              ConnectTimeout 15
          EOF

          chmod 600 ~/.ssh/config

      - name: Upload test site
        shell: bash
        run: |
          set -euo pipefail

          ssh admin-test-deploy \
            'command -v rsync >/dev/null && test -w /home/wwwroot/MediaForge/creatorhub-admin-test'

          rsync -rz \
            --chmod=D755,F644 \
            --delay-updates \
            site/ \
            admin-test-deploy:/home/wwwroot/MediaForge/creatorhub-admin-test/

      - name: Verify deployed page
        shell: bash
        run: |
          set -euo pipefail

          curl -fsSL \
            --max-time 30 \
            --retry 3 \
            --retry-all-errors \
            -o deployed-index.html \
            "https://admin-test.linggandu.site/index.html?deploy=$BUILD_SHA"

          cmp site/index.html deployed-index.html

      - name: Remove SSH private key
        if: always()
        run: rm -f ~/.ssh/admin_test_key
```

### C.4 最终自动部署与版本目录版

路径：`.github/workflows/deploy-admin-test.yml`。第 8 步增加触发条件、第 9 步替换上传步骤后，应得到这一结构。注释中的旧条件仅作历史记录，不参与执行。

```yaml
name: Deploy Admin Test

on:
  workflow_run:
    workflows: ['Admin CI']
    types: [completed]
    branches: [master]

  workflow_dispatch:
    inputs:
      run_id:
        description: '已通过的 master Admin CI 运行 ID（运行页面网址中的数字）'
        required: true
        type: string

permissions:
  contents: read
  actions: read

# 同一时间只执行一次测试站部署。
concurrency:
  group: deploy-admin-test
  cancel-in-progress: false

jobs:
  deploy:
    name: Deploy to test site
    #if: github.ref == 'refs/heads/master'
    if: >-
      github.ref == 'refs/heads/master' &&
      (
        github.event_name == 'workflow_dispatch' ||
        (
          github.event.workflow_run.conclusion == 'success' &&
          github.event.workflow_run.event == 'push'
        )
      )
    runs-on: ubuntu-24.04
    timeout-minutes: 15

    steps:
      - name: Download verified build
        env:
          GH_TOKEN: ${{ github.token }}
          GH_REPO: ${{ github.repository }}
          #RUN_ID: ${{ inputs.run_id }}
          RUN_ID: ${{ github.event.workflow_run.id || inputs.run_id }}
        shell: bash
        run: |
          set -euo pipefail

          [[ "$RUN_ID" =~ ^[0-9]+$ ]]

          gh api "repos/$GH_REPO/actions/runs/$RUN_ID" > run.json

          # 只接受当前仓库 master 分支成功的 CI 推送构建。
          jq -e '
            .conclusion == "success" and
            .head_branch == "master" and
            .event == "push" and
            .path == ".github/workflows/ci.yml"
          ' run.json > /dev/null

          BUILD_SHA=$(jq -r '.head_sha' run.json)

          gh run download "$RUN_ID" \
            --repo "$GH_REPO" \
            --name "web-ele-dist-$BUILD_SHA" \
            --dir site

          test -s site/index.html

          echo "Deploying commit: $BUILD_SHA"
          echo "BUILD_SHA=$BUILD_SHA" >> "$GITHUB_ENV"

      - name: Configure SSH
        env:
          DEPLOY_HOST: ${{ secrets.TEST_SSH_HOST }}
          DEPLOY_USER: ${{ secrets.TEST_SSH_USER }}
          DEPLOY_PORT: ${{ secrets.TEST_SSH_PORT }}
          DEPLOY_KEY: ${{ secrets.TEST_SSH_PRIVATE_KEY }}
          KNOWN_HOSTS: ${{ secrets.TEST_SSH_KNOWN_HOSTS }}
        shell: bash
        run: |
          set -euo pipefail

          test -n "$DEPLOY_HOST"
          test -n "$DEPLOY_USER"
          test -n "$DEPLOY_PORT"
          test -n "$DEPLOY_KEY"
          test -n "$KNOWN_HOSTS"

          install -d -m 700 ~/.ssh
          printf '%s\n' "$DEPLOY_KEY" > ~/.ssh/admin_test_key
          printf '%s\n' "$KNOWN_HOSTS" > ~/.ssh/known_hosts
          chmod 600 ~/.ssh/admin_test_key ~/.ssh/known_hosts

          cat > ~/.ssh/config <<EOF
          Host admin-test-deploy
              HostName $DEPLOY_HOST
              User $DEPLOY_USER
              Port $DEPLOY_PORT
              IdentityFile ~/.ssh/admin_test_key
              IdentitiesOnly yes
              StrictHostKeyChecking yes
              BatchMode yes
              ConnectTimeout 15
          EOF

          chmod 600 ~/.ssh/config

      - name: Upload and activate release
        shell: bash
        run: |
          set -euo pipefail

          [[ "$BUILD_SHA" =~ ^[0-9a-f]{40}$ ]]

          SITE=/home/wwwroot/MediaForge/creatorhub-admin-test
          RELEASE="$BUILD_SHA-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"

          ssh admin-test-deploy \
            "command -v rsync >/dev/null && mkdir -p '$SITE/releases/$RELEASE'"

          # 上传到独立版本目录，完成前不影响当前网站。
          rsync -rz \
            --chmod=D755,F644 \
            site/ \
            "admin-test-deploy:$SITE/releases/$RELEASE/"

          # 保存上一版入口，然后原子切换当前版本。
          ssh admin-test-deploy bash -s -- "$RELEASE" <<'REMOTE'
          set -euo pipefail

          SITE=/home/wwwroot/MediaForge/creatorhub-admin-test
          RELEASE="$1"

          test -s "$SITE/releases/$RELEASE/index.html"
          test -L "$SITE/current"

          PREVIOUS=$(readlink "$SITE/current")

          ln -s "$PREVIOUS" "$SITE/.previous-$RELEASE"
          mv -Tf "$SITE/.previous-$RELEASE" "$SITE/previous"

          ln -s "releases/$RELEASE" "$SITE/.current-$RELEASE"
          mv -Tf "$SITE/.current-$RELEASE" "$SITE/current"

          echo "Activated release: $RELEASE"
          REMOTE

          echo "部署版本：$RELEASE" >> "$GITHUB_STEP_SUMMARY"

      - name: Verify deployed page
        shell: bash
        run: |
          set -euo pipefail

          curl -fsSL \
            --max-time 30 \
            --retry 3 \
            --retry-all-errors \
            -o deployed-index.html \
            "https://admin-test.linggandu.site/index.html?deploy=$BUILD_SHA"

          cmp site/index.html deployed-index.html

      - name: Remove SSH private key
        if: always()
        run: rm -f ~/.ssh/admin_test_key
```

### C.5 最终回滚工作流

路径：`.github/workflows/rollback-admin-test.yml`，在第 10 步的新分支创建。

```yaml
name: Rollback Admin Test

on:
  workflow_dispatch:
    inputs:
      confirm:
        description: '确认将测试站回滚到 previous 版本'
        required: true
        default: false
        type: boolean

permissions: {}

# 与部署使用相同的组，避免部署和回滚同时执行。
concurrency:
  group: deploy-admin-test
  cancel-in-progress: false

jobs:
  rollback:
    if: github.ref == 'refs/heads/master' && inputs.confirm
    runs-on: ubuntu-24.04
    timeout-minutes: 10

    steps:
      - name: Configure SSH
        env:
          DEPLOY_HOST: ${{ secrets.TEST_SSH_HOST }}
          DEPLOY_USER: ${{ secrets.TEST_SSH_USER }}
          DEPLOY_PORT: ${{ secrets.TEST_SSH_PORT }}
          DEPLOY_KEY: ${{ secrets.TEST_SSH_PRIVATE_KEY }}
          KNOWN_HOSTS: ${{ secrets.TEST_SSH_KNOWN_HOSTS }}
        shell: bash
        run: |
          set -euo pipefail

          test -n "$DEPLOY_HOST"
          test -n "$DEPLOY_USER"
          test -n "$DEPLOY_PORT"
          test -n "$DEPLOY_KEY"
          test -n "$KNOWN_HOSTS"

          install -d -m 700 ~/.ssh
          printf '%s\n' "$DEPLOY_KEY" > ~/.ssh/admin_test_key
          printf '%s\n' "$KNOWN_HOSTS" > ~/.ssh/known_hosts
          chmod 600 ~/.ssh/admin_test_key ~/.ssh/known_hosts

          cat > ~/.ssh/config <<EOF
          Host admin-test-deploy
              HostName $DEPLOY_HOST
              User $DEPLOY_USER
              Port $DEPLOY_PORT
              IdentityFile ~/.ssh/admin_test_key
              IdentitiesOnly yes
              StrictHostKeyChecking yes
              BatchMode yes
              ConnectTimeout 15
          EOF

          chmod 600 ~/.ssh/config

      - name: Switch to previous release
        shell: bash
        run: |
          set -euo pipefail

          ssh admin-test-deploy bash -s -- "$GITHUB_RUN_ID" <<'REMOTE'
          set -euo pipefail

          SITE=/home/wwwroot/MediaForge/creatorhub-admin-test
          OPERATION="$1"

          test -L "$SITE/current"
          test -L "$SITE/previous"

          CURRENT=$(readlink "$SITE/current")
          TARGET=$(readlink "$SITE/previous")

          # 只允许切换到站点 releases 目录内的有效版本。
          for RELEASE in "$CURRENT" "$TARGET"; do
            RESOLVED=$(readlink -f "$SITE/$RELEASE")
            case "$RESOLVED" in
              "$SITE/releases/"*) ;;
              *) echo "版本目录无效"; exit 1 ;;
            esac
            test -s "$RESOLVED/index.html"
          done

          test "$CURRENT" != "$TARGET"

          ln -s "$TARGET" "$SITE/.rollback-current-$OPERATION"
          mv -Tf "$SITE/.rollback-current-$OPERATION" "$SITE/current"

          ln -s "$CURRENT" "$SITE/.rollback-previous-$OPERATION"
          mv -Tf "$SITE/.rollback-previous-$OPERATION" "$SITE/previous"

          echo "Rolled back: $CURRENT -> $TARGET"
          REMOTE

      - name: Verify rolled-back page
        shell: bash
        run: |
          set -euo pipefail

          ssh admin-test-deploy \
            'cat /home/wwwroot/MediaForge/creatorhub-admin-test/current/index.html' \
            > expected-index.html

          curl -fsSL \
            --max-time 30 \
            --retry 3 \
            --retry-all-errors \
            -o deployed-index.html \
            "https://admin-test.linggandu.site/index.html?rollback=$GITHUB_RUN_ID"

          cmp expected-index.html deployed-index.html

      - name: Remove SSH private key
        if: always()
        run: rm -f ~/.ssh/admin_test_key
```
