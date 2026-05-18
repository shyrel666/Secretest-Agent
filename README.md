# Secretest Agent

Secretest Agent 是一个基于国标知识库和多 Agent 协作的代码安全审计、学习与测评平台。系统围绕「代码审计 → 能力测评 → 题库练习 → 错题讲解 → 学习报告」形成闭环，帮助开发者和安全测试人员按标准化漏洞类型持续训练审计能力。

## 核心能力

- **代码审计 Agent**：基于 LLM 的代码安全分析，支持流式输出和上下文对话。
- **内置国标知识库**：本仓库保留 `data/knowledge/knowledge.db`，克隆后即可使用已导入的知识库数据。
- **智能测评**：出题 Agent、审核 Agent、讲解 Agent 协作生成测评题、审核题目质量并生成学习反馈。
- **题库练习**：测评题自动入库，支持题库浏览、随机抽题、闪卡模式、错题筛选和 AI 讲解缓存。
- **动态学习报告**：根据用户本次答题情况生成掌握点、薄弱点、学习建议和下一步主题。
- **多模型配置**：支持全局模型配置，也支持为不同 Agent 单独设置模型、温度和思考模式。

## 多 Agent 流程

```text
知识库 → 出题 Agent → 审核 Agent → 用户答题 → 讲解 Agent
   ↑                                                ↓
   └────────────── 学习报告 / 题库练习 ←────────────┘
```

| Agent | 职责 |
| --- | --- |
| 知识库 Agent | 文档导入、语义搜索、标准条款检索 |
| 出题 Agent | 基于知识库生成漏洞审计题目 |
| 审核 Agent | 校验题目是否符合标准、是否泄露答案、是否可答 |
| 讲解 Agent | 错题讲解、学习路径建议、动态学习报告 |
| Orchestrator | 协调各 Agent 的调用、补题、去重、覆盖率追踪 |

## 技术栈

| 类别 | 技术 |
| --- | --- |
| Framework | Next.js 16 App Router |
| Core | React 19 |
| Language | TypeScript 5 |
| UI | shadcn/ui + Radix UI |
| Styling | Tailwind CSS 4 |
| AI SDK | coze-coding-dev-sdk |
| Knowledge Store | SQLite + sqlite-vec + FTS5 |
| State | Zustand 持久化 |
| Package Manager | pnpm 9+ |

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/shyrel666/Secretest-Agent.git
cd Secretest-Agent
```

### 2. 安装依赖

本项目限定使用 `pnpm`。

```bash
pnpm install
```

### 3. 配置环境变量

复制环境变量模板：

```bash
cp .env.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

编辑 `.env.local`：

```env
PORT=10929
HOSTNAME=localhost

# 本地单用户模式可设为 true；局域网多人共享建议保持 false
QUESTION_BANK_SINGLE_USER_MODE=false

COZE_WORKLOAD_IDENTITY_API_KEY=your-api-key
COZE_INTEGRATION_MODEL_BASE_URL=your-model-url
```

`COZE_INTEGRATION_MODEL_BASE_URL` 可使用 OpenAI 兼容接口，例如：

- 阿里百炼：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- 火山方舟：`https://ark.cn-beijing.volces.com/api/v3`
- DeepSeek：`https://api.deepseek.com/v1`

### 4. 启动开发服务

```bash
pnpm dev
```

打开：

```text
http://localhost:10929
```

### 5. 构建和生产启动

```bash
pnpm build
pnpm start
```

## 内置知识库说明

仓库保留了主知识库数据库：

```text
data/knowledge/knowledge.db
```

它包含已导入的国标文档、结构化分块、FTS 索引和向量索引。为了避免提交 SQLite 运行时临时文件，以下文件已被 `.gitignore` 忽略：

```text
data/knowledge/*.db-wal
data/knowledge/*.db-shm
data/knowledge/*.db-journal
```

如果你重新导入文档并希望把新的知识库提交到 GitHub，建议先停止服务，确保 SQLite WAL 已写回主库，再提交 `data/knowledge/knowledge.db`。

> 注意：当前数据库也可能包含本地题库、答题记录、掌握状态和 AI 讲解缓存。如果仓库公开发布，请先确认这些数据可以公开，或清理用户学习数据后再提交。

## 局域网访问

如果希望同局域网设备访问，需要在 `.env.local` 中设置：

```env
HOSTNAME=0.0.0.0
PORT=10929
QUESTION_BANK_SINGLE_USER_MODE=false
```

然后访问：

```text
http://服务器IP:10929
```

`QUESTION_BANK_SINGLE_USER_MODE=false` 可以避免新访问者自动继承本机最活跃用户的题库记录。只有本地单人使用时，才建议设置为 `true`。

## 目录结构

```text
src/
├── app/
│   ├── api/
│   │   ├── agent/route.ts              # Agent 协调接口
│   │   ├── audit/route.ts              # 代码审计接口
│   │   ├── explain/route.ts            # 错题讲解流式接口
│   │   ├── knowledge/                  # 知识库导入、搜索、统计、文档管理
│   │   ├── learning/                   # 学习中心 API
│   │   └── question-bank/route.ts      # 题库练习 API
│   ├── assessment/                     # 能力测评页面
│   ├── audit/                          # 代码审计页面
│   ├── knowledge/                      # 知识库管理页面
│   ├── learning/                       # 学习中心页面
│   ├── practice/                       # 题库练习页面
│   ├── settings/                       # 模型配置页面
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── layout/
│   ├── providers/
│   └── ui/
├── lib/
│   ├── agents/                         # 多 Agent 实现
│   ├── knowledge/                      # SQLite 知识库、向量检索、混合检索
│   ├── learning/                       # 学习主题、课程缓存
│   ├── question-bank/                  # 题库 SQLite 存储
│   ├── store/                          # Zustand stores
│   ├── standards.ts                    # 国标语言映射
│   └── user-context.ts                 # 匿名用户上下文
└── server.ts                           # 自定义 Next.js 服务入口

data/
└── knowledge/
    └── knowledge.db                    # 已保留的内置知识库 SQLite 数据库
```

## API 概览

### 代码审计

```http
POST /api/audit
```

请求示例：

```json
{
  "code": "代码内容",
  "history": [],
  "config": {
    "model": "doubao-seed-2-0-pro-260215",
    "temperature": 0.3,
    "thinking": true
  }
}
```

### Agent 协调

```http
POST /api/agent
```

| action | 说明 |
| --- | --- |
| `generateQuestion` | 生成单个审核通过的题目 |
| `generateQuizSet` | 生成整套测评题 |
| `explainAnswer` | 讲解用户答题 |
| `generateReport` | 根据答题结果生成学习报告 |

### 题库练习

```http
GET /api/question-bank?action=stats
GET /api/question-bank?action=list
GET /api/question-bank?action=random
GET /api/question-bank?action=detail&id=xxx
POST /api/question-bank
DELETE /api/question-bank?id=xxx
```

### 知识库

```http
POST /api/knowledge/import
GET /api/knowledge/search?q=SQL注入
GET /api/knowledge/documents
GET /api/knowledge/stats
DELETE /api/knowledge/documents?id=xxx
```

## 常用命令

```bash
# 开发
pnpm dev

# 类型检查
pnpm ts-check

# ESLint
pnpm lint

# 生产构建
pnpm build

# 生产启动
pnpm start
```

常用回归脚本：

```bash
pnpm exec tsx scripts/question-bank-user-continuity.test.ts
pnpm exec tsx scripts/learning-report-dynamic-fallback.test.ts
pnpm exec tsx scripts/assessment-report-content.test.ts
pnpm exec tsx scripts/learning-report-normalized-types.test.ts
pnpm exec tsx scripts/explainer-learning-path-config.test.ts
```

## Git 提交注意事项

以下内容不应提交：

- `.env.local`
- `node_modules/`
- `.next/`
- `dist/`
- `tmp/`
- `output/`
- `data/knowledge/*.db-wal`
- `data/knowledge/*.db-shm`

本仓库当前允许提交：

- `data/knowledge/knowledge.db`

如果你不希望公开题库和答题历史，请先净化数据库后再推送。

## Windows Server 部署

Windows Server 2019 部署说明见：

- [`WINDOWS_SERVER_DEPLOY.md`](./WINDOWS_SERVER_DEPLOY.md)

## License

当前项目未声明开源协议。公开仓库如需他人使用、分发或二次开发，建议补充 `LICENSE` 文件。
