# Windows Server 2019 部署说明

本文档用于将 `Secretest Agent` 部署到一台全新的 `Windows Server 2019` 服务器，并支持同局域网用户访问。

## 1. 部署目标

- 目标系统：Windows Server 2019
- 部署方式：Node.js + pnpm
- 运行模式：生产模式
- 访问方式：局域网访问 `http://服务器IP:10929`

## 1.1 适用说明

本文档按 `Windows Server 2019 x64` 编写，默认你有：

- 服务器管理员权限
- 可联网安装 Node.js / pnpm（或使用一键启动脚本自动安装）
- 可修改 Windows 防火墙
- 可在服务器磁盘上创建应用目录

## 1.2 一键启动脚本（推荐）

项目根目录提供了自动化脚本，可跳过手动安装步骤：

| 脚本 | 用途 |
| --- | --- |
| `一键启动.bat` | 自动检测并安装所有缺失依赖（Node.js、VC++ 运行库、pnpm），首次自动构建，后续直接启动 |

**使用方式：** 将整个项目目录上传到服务器后，**右键 `一键启动.bat` → 选择「以管理员身份运行」** 即可。

> 脚本启动时会自动检测管理员权限。如果未以管理员身份运行，会提示并询问是否继续——建议始终以管理员身份运行，否则自动安装 Node.js / VC++ 运行库可能失败。

脚本会自动处理：

1. **管理员权限检测** → 非管理员运行时提示右键「以管理员身份运行」，可选择继续或退出
2. 未安装 Node.js → 通过 `winget` 安装，或动态获取最新 LTS 版本下载 msi 静默安装
3. 未安装 VC++ 运行库 → 通过 `winget` 自动安装
4. 未安装 pnpm → 通过 `npm install -g pnpm@9` 安装（锁定 v9 主版本）
5. 未生成 `.env.local` → 从 `.env.example` 复制并提示编辑
6. 端口冲突检测 → 自动读取 `.env.local` 中的 `PORT`，检测端口占用并提示占用进程
7. 未构建（`dist/server.js` 不存在）→ 自动 `pnpm install` + `pnpm build`
8. 已构建 → 直接 `pnpm start`

> 如果你需要更精细的控制（如指定 Node.js 版本、手动配置 NSSM 服务），请参考下面的手动部署章节。

## 2. 服务器准备

### 2.1 安装基础软件

在干净的 Windows Server 2019 上先安装：

- Node.js 20.x LTS
- pnpm 9.x

建议安装完成后在 `PowerShell` 或 `CMD` 中执行：

```powershell
node -v
pnpm -v
```

预期：

- `node` 版本为 `20+`
- `pnpm` 版本为 `9+`

### 2.2 建议安装的系统组件

为了避免原生依赖加载问题，建议同时安装：

- Microsoft Visual C++ Redistributable 2015-2022 x64

本项目依赖：

- `better-sqlite3`
- `sqlite-vec-windows-x64`

如果服务器较精简，缺少 VC++ 运行库时，项目可能无法正常启动。

### 2.3 PowerShell 执行策略

如果后续需要执行本地 `.ps1` 脚本，建议先检查执行策略：

```powershell
Get-ExecutionPolicy
```

如果策略过严，可在管理员 PowerShell 中执行：

```powershell
Set-ExecutionPolicy RemoteSigned
```

如果你只使用 `pnpm install / pnpm build / pnpm start`，这一项通常不是必须的。

## 3. 上传项目

将整个项目目录上传到服务器，例如：

```text
D:\apps\secretest-agent
```

最终目录示例：

```text
D:\apps\secretest-agent
├── src
├── public
├── package.json
├── pnpm-lock.yaml
├── .env.local
├── 一键启动.bat       ← 双击即可自动检测环境、安装依赖、构建、启动
└── ...
```

## 4. 配置环境变量

编辑项目根目录下的 [`.env.local`](D:\Pycharm_project\projects\.env.local)。

至少需要配置：

```env
PORT=10929
HOSTNAME=0.0.0.0
```

### 关键说明

- `HOSTNAME=0.0.0.0`
  - 必须配置，否则服务默认只监听 `localhost`，局域网其他机器无法访问
- `PORT=10929`
  - 可按需修改，但文档以下示例默认使用 `10929`

## 5. 安装依赖

在项目根目录执行：

```powershell
pnpm install
```

如果安装成功，再执行：

```powershell
pnpm ts-check
```

用于提前确认 TypeScript 构建环境正常。

## 6. 构建项目

在项目根目录执行：

```powershell
pnpm build
```

构建成功后会生成：

- `.next/`
- `dist/`

## 7. 启动项目

在项目根目录执行：

```powershell
pnpm start
```

如果启动成功，控制台会输出类似内容：

```text
> Server listening at http://0.0.0.0:10929 as production
```

## 8. 开放防火墙端口

如果要让局域网其他用户访问，需要开放 Windows 防火墙端口。

以管理员 PowerShell 执行：

```powershell
New-NetFirewallRule `
  -DisplayName "Secretest Agent 10929" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 10929 `
  -Action Allow
```

如果你修改了端口，请把上面的 `10929` 改成实际端口。

## 9. 验证局域网访问

### 9.1 查看服务器 IP

在服务器执行：

```powershell
ipconfig
```

找到实际网卡的 IPv4 地址，例如：

```text
192.168.110.13
```

### 9.2 本机验证

在服务器本机浏览器访问：

```text
http://127.0.0.1:10929
```

### 9.3 局域网验证

在同局域网另一台电脑浏览器访问：

```text
http://服务器IP:10929
```

例如：

```text
http://192.168.110.13:10929
```

## 10. 推荐的生产运行方式

不建议仅靠一个打开的终端窗口长期运行。

推荐两种方式：

### 方式 A：使用 NSSM 注册为 Windows 服务

适合正式长期运行。

1. 下载并安装 `NSSM`
2. 以管理员身份执行：

```powershell
nssm install SecretestAgent
```

在弹出的界面中配置：

- `Application path`：`pnpm.cmd` 的完整路径
- `Startup directory`：项目根目录，例如 `D:\apps\secretest-agent`
- `Arguments`：`start`

配置完成后执行：

```powershell
nssm start SecretestAgent
```

### 方式 B：使用计划任务开机自启

适合轻量部署，不想额外安装服务管理器时使用。

核心思路：

- 登录用户开机后自动执行 `pnpm start`
- 工作目录指向项目根目录

## 11. 数据目录说明

项目运行期间会在根目录下生成本地数据：

```text
data\knowledge\
```

这里会保存：

- 知识库 SQLite 数据
- 向量索引数据
- 题库相关本地数据

因此部署时要注意：

- 不要随意删除 `data/`
- 升级代码前最好备份 `data/`
- 若要迁移服务器，记得同时迁移 `data/`

## 12. 升级发布流程

后续更新版本时，建议按以下顺序操作：

1. 停止当前服务
2. 备份 `data/` 与 `.env.local`
3. 覆盖新代码
4. 删除 `dist/` 目录（触发一键启动脚本重新构建）
5. 双击 `一键启动.bat` 重新启动服务

## 13. 常见问题

### 13.1 局域网访问不到

优先检查：

- `.env.local` 是否配置了 `HOSTNAME=0.0.0.0`
- 服务是否真的启动成功
- 防火墙是否已放行端口
- 客户端和服务器是否在同一局域网
- 路由器是否开启了 AP 隔离 / 客户端隔离

另外还要确认：

- 服务器网卡不是“公用网络”下被额外策略限制
- 服务实际监听的是 `0.0.0.0:10929` 而不是 `localhost:10929`

### 13.2 启动时报原生模块或 sqlite 错误

检查：

- Node.js 版本是否为 20+
- 是否安装了 VC++ 运行库
- 是否完整执行过 `pnpm install`

在 Windows Server 2019 上，这类问题通常优先排查运行库和权限。

### 13.3 一键启动提示需要管理员权限

脚本启动时会检测管理员权限。如果未以管理员身份运行，会弹出提示。

解决方法：

- **右键** `一键启动.bat` → 选择 **「以管理员身份运行」**
- 如果选择继续运行，后续自动安装 Node.js / VC++ 运行库的步骤可能会静默失败

### 13.4 启动时提示端口被占用

脚本在启动服务前会自动检测 `.env.local` 中配置的端口（默认 `10929`）是否被占用。

如果提示端口被占用，有两种解决方法：

1. **修改端口**：编辑 `.env.local`，将 `PORT=10929` 改为其他未占用的端口（如 `PORT=10930`），然后重新运行脚本
2. **关闭占用程序**：脚本会显示占用端口的进程 PID 和名称，可手动关闭该程序后重新运行

### 13.5 AI 功能不可用

检查 `.env.local` 是否存在，以及服务是否正常启动。

### 13.6 页面能打开，但知识库/题目功能异常

检查：

- `data/knowledge/` 是否有写权限
- 服务器磁盘是否可写
- 首次运行是否成功生成本地数据库文件

### 13.7 服务器重启后服务没自动恢复

说明你当前可能只是手动执行了：

```powershell
pnpm start
```

这只会在当前终端会话中运行。正式部署到 Windows Server 2019 时，建议改成：

- `NSSM` 注册 Windows 服务
- 或 `计划任务` 开机自启

## 14. 最小部署命令清单

### 使用一键启动脚本（推荐）

```powershell
cd D:\apps\secretest-agent
# 右键一键启动.bat → 以管理员身份运行
# 或在管理员终端中执行：
.\一键启动.bat
```

脚本会自动完成所有依赖安装、构建和启动，无需提前准备环境。

> **重要**：请以管理员身份运行脚本，否则自动安装 Node.js / VC++ 运行库等步骤可能失败。

### 手动部署

如果服务器环境已经准备好，最小流程如下：

```powershell
cd D:\apps\secretest-agent
pnpm install
pnpm build
pnpm start
```

并确保：

```env
HOSTNAME=0.0.0.0
PORT=10929
```

## 15. 建议

如果这台 Windows 服务器要给多人长期使用，建议下一步再补两项：

- 反向代理与域名访问
- 正式登录体系

当前版本已经支持匿名用户隔离学习数据，适合同局域网内的多人试用与内测。
