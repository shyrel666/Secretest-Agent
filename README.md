# Secretest Agent

Secretest Agent 是一个基于多 Agent 协作的智能代码安全审计平台。上传国标 PDF 文档构建知识库，AI 自动出题、审核、讲解，形成完整的漏洞审计学习闭环。

## 部署文档

- Windows Server 2019 部署说明：[`WINDOWS_SERVER_DEPLOY.md`](./WINDOWS_SERVER_DEPLOY.md)

## 核心功能

- **智能代码审计** — AI 驱动的代码安全分析，基于 GB/T 34944-2017 / GB/T 34943-2017 标准，支持流式输出
- **知识库管理** — 上传国标 PDF 文档，构建专属知识库，支持语义搜索
- **智能测评** — 多 Agent 协作出题、审核、讲解，闭环学习系统

## 多 Agent 架构

```
知识库 → 出题Agent → 审核Agent → 用户答题 → 讲解Agent
   ↑                                              ↓
   └──────────── 学习报告 ←─────────────────────┘
```

| Agent | 职责 |
|-------|------|
| 知识库 Agent | 文档导入、语义搜索 |
| 出题 Agent | 基于知识库生成专业测评题目 |
| 审核 Agent | 验证题目质量和准确性 |
| 讲解 Agent | 错题讲解、学习路径建议 |

## 快速开始

### 环境要求

- Node.js 20+
- pnpm 9+（项目限定，不支持 npm / yarn）

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制 `.env.local` 并填入你的 API 配置：

```env
# 服务端口
PORT=10929

# 监听地址
# 本地开发可保留默认；如果要让局域网其他机器访问，必须配置为 0.0.0.0
HOSTNAME=0.0.0.0

# API Key（LLM 调用 + 知识库向量化 共用）
COZE_WORKLOAD_IDENTITY_API_KEY=your-api-key

# LLM + Embedding 端点（知识库向量化也使用此地址）
COZE_INTEGRATION_MODEL_BASE_URL=your-model-url
```

`COZE_INTEGRATION_MODEL_BASE_URL` 支持任何 OpenAI 兼容端点：
- 阿里百炼（推荐，支持 Embedding）：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- 火山方舟：`https://ark.cn-beijing.volces.com/api/v3`
- DeepSeek：`https://api.deepseek.com/v1`

> **知识库已内建**，文档向量化数据本地存储于 `data/knowledge/`，无需搭建外部知识库服务。

> **局域网访问说明**：如果需要让同局域网的其他用户访问，除了开放防火墙端口外，还必须将 `HOSTNAME` 配置为 `0.0.0.0`。

### 3. 启动开发服务器

```bash
pnpm dev
```

打开 [http://localhost:10929](http://localhost:10929) 查看应用。支持热更新。

### 4. 构建与部署

```bash
# 构建生产版本
pnpm build

# 启动生产服务器
pnpm start
```

如果你要部署到一台全新的 Windows 服务器，请直接参考：

- [`WINDOWS_SERVER_DEPLOY.md`](./WINDOWS_SERVER_DEPLOY.md)

如果只是局域网内临时共享访问，启动前请确保：

```env
HOSTNAME=0.0.0.0
PORT=10929
```

然后使用：

```text
http://服务器IP:10929
```

进行访问。

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── agent/route.ts              # Agent 协调 API
│   │   ├── audit/route.ts              # 代码审计 API（流式）
│   │   ├── explain/route.ts            # 讲解 API（流式）
│   │   └── knowledge/
│   │       ├── import/route.ts         # 知识库导入（PDF/TXT/MD）
│   │       ├── search/route.ts         # 知识库语义搜索
│   │       └── documents/route.ts      # 文档列表 & 删除
│   ├── audit/page.tsx                  # 代码审计页面
│   ├── knowledge/page.tsx              # 知识库管理页面
│   ├── assessment/page.tsx             # 智能测评页面
│   ├── settings/page.tsx               # 模型配置页面
│   ├── layout.tsx                      # 根布局
│   └── page.tsx                        # 首页
├── lib/
│   ├── knowledge/                      # 内建知识库（本地向量存储）
│   │   ├── index.ts                    # LocalKnowledgeBase 统一 API
│   │   ├── chunker.ts                  # 文本分块
│   │   ├── embedder.ts                 # 向量化（DashScope text-embedding-v3）
│   │   └── vector-store.ts             # JSON 文件存储 + 余弦相似度检索
│   ├── agents/
│   │   ├── types.ts                    # Agent 类型定义
│   │   ├── knowledge-agent.ts          # 知识库 Agent
│   │   ├── question-generator-agent.ts # 出题 Agent
│   │   ├── reviewer-agent.ts           # 审核 Agent
│   │   ├── explainer-agent.ts          # 讲解 Agent
│   │   └── orchestrator.ts             # Agent 协调器
│   ├── store/
│   │   └── ai-config.ts               # 模型配置 Store (zustand)
│   └── utils.ts                        # 工具函数
├── components/
│   ├── layout/                         # 布局组件
│   └── ui/                             # shadcn/ui 组件库
└── hooks/                              # 自定义 Hooks

data/                                   # 运行时数据（已加入 .gitignore）
└── knowledge/
    └── vulnerability_audit_standards/
        └── docs/                       # 每个文档的分块向量 JSON
```

## API 接口

### POST /api/audit
代码安全审计（流式 SSE 输出）

```json
{ "code": "代码内容", "history": [], "config": { "model": "...", "temperature": 0.3 } }
```

### POST /api/agent
Agent 协调接口，通过 `action` 字段区分操作：

| action | 说明 |
|--------|------|
| `generateQuestion` | 生成单个审核通过的题目 |
| `generateQuizSet` | 生成整套测评题 |
| `explainAnswer` | 讲解答题结果 |
| `generateReport` | 生成学习报告 |

### POST /api/explain
错题讲解（流式 SSE 输出）

### POST /api/knowledge/import
上传文档到知识库，支持 PDF / TXT / MD 格式

### GET /api/knowledge/search?q=xxx
语义搜索知识库，返回相关文本片段

### GET /api/knowledge/documents
获取已存储文档列表

### DELETE /api/knowledge/documents?id=xxx
删除指定文档及其所有向量数据

## 模型配置

支持在 `/settings` 页面配置各 Agent 使用不同模型：

| 模型 | 说明 |
|------|------|
| Doubao Pro | 旗舰模型，复杂推理 |
| Doubao Lite | 平衡性能与成本 |
| Doubao Seed | 多模态 Agent 优化 |
| DeepSeek V3.2 | 高级推理 |
| DeepSeek R1 | 研究和分析 |
| Kimi K2 | 长上下文 |
| Kimi K2.5 | Agent、代码、视觉 |

配置参数：`model`（模型 ID）、`temperature`（0-1）、`thinking`（是否开启思考模式）

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) |
| 核心 | React 19, TypeScript 5 |
| UI | shadcn/ui (Radix UI) |
| 样式 | Tailwind CSS 4 |
| AI SDK | coze-coding-dev-sdk（LLM）+ DashScope Embedding（内建知识库） |
| 状态管理 | Zustand（持久化） |
| 多人隔离 | 匿名用户 Cookie + 用户级本地持久化 |
| 表单 | React Hook Form + Zod |
| 图标 | Lucide React |
| 包管理 | pnpm 9+ |

## 开发规范

- **包管理**：仅使用 pnpm
- **主题**：深色模式，teal 色调
- **流式输出**：后端 ReadableStream + SSE，前端 fetch + Reader
- **类型安全**：严格 TypeScript 检查
- **路径别名**：使用 `@/` 导入（已配置）

## 常用命令

```bash
# 开发
pnpm dev              # 启动开发服务器 (端口 10929)
pnpm build            # 构建生产版本
pnpm start            # 启动生产服务器

# 检查
pnpm ts-check         # TypeScript 类型检查
pnpm lint             # ESLint 检查
```
