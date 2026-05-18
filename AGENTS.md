# 项目上下文

## 项目概述

代码漏洞审计Agent助手 - 基于多Agent协作的智能代码安全审计系统。

用户上传国标PDF文档构建知识库，AI自动出题、审核、讲解，形成完整的漏洞审计学习闭环。

### 核心功能

1. **代码审计 Agent** - AI驱动的代码安全分析，支持流式输出
2. **知识库管理** - 上传国标PDF文档，构建专属知识库
3. **智能测评** - 多Agent协作：出题、审核、讲解

### 多Agent架构

```
知识库 → 出题Agent → 审核Agent → 用户答题 → 讲解Agent
   ↑                                              ↓
   └──────────── 学习报告 ←─────────────────────┘
```

- **知识库Agent**: 文档导入、语义搜索
- **出题Agent**: 基于知识库生成专业题目
- **审核Agent**: 验证题目质量和准确性
- **讲解Agent**: 错题讲解、学习路径建议

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **AI SDK**: coze-coding-dev-sdk (LLM + Knowledge)

## 目录结构

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── agent/route.ts        # Agent协调API
│   │   │   ├── audit/route.ts        # 代码审计API
│   │   │   ├── explain/route.ts      # 讲解API (流式)
│   │   │   └── knowledge/
│   │   │       ├── import/route.ts   # 知识库导入
│   │   │       └── search/route.ts   # 知识库搜索
│   │   ├── audit/                    # 代码审计页面
│   │   ├── knowledge/                # 知识库管理页面
│   │   ├── assessment/               # 智能测评页面
│   │   ├── settings/                 # 模型配置页面
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib/
│   │   ├── agents/
│   │   │   ├── types.ts              # Agent类型定义
│   │   │   ├── knowledge-agent.ts    # 知识库Agent
│   │   │   ├── question-generator-agent.ts # 出题Agent
│   │   │   ├── reviewer-agent.ts     # 审核Agent
│   │   │   ├── explainer-agent.ts    # 讲解Agent
│   │   │   └── orchestrator.ts       # Agent协调器
│   │   └── store/
│   │       └── ai-config.ts          # 模型配置Store (zustand)
│   └── components/
│       └── layout/                   # 布局组件
```

## API 接口

### POST /api/knowledge/import
上传文档到知识库

### GET /api/knowledge/search?q=xxx
搜索知识库

### POST /api/agent
Agent协调接口，支持多种action:
- `generateQuestion`: 生成单个题目
- `generateQuizSet`: 生成整套题目
- `explainAnswer`: 讲解答题
- `generateReport`: 生成学习报告

请求参数支持 `configs` 字段，用于传递各Agent的模型配置。

### POST /api/audit
代码安全审计（流式输出）

请求参数:
- `code`: 代码内容
- `history`: 对话历史
- `config`: 模型配置 (可选)

### POST /api/explain
错题讲解（流式输出）

请求参数:
- `question`: 题目内容
- `userAnswer`: 用户答案
- `isCorrect`: 是否正确
- `config`: 模型配置 (可选)

## 模型配置

### 支持的模型
- Doubao Pro (旗舰模型)
- Doubao Lite (平衡性能与成本)
- Doubao Seed (多模态Agent优化)
- DeepSeek V3.2 (高级推理)
- DeepSeek R1 (研究和分析)
- Kimi K2 (长上下文)
- Kimi K2.5 (Agent、代码、视觉)

### 配置方式
1. **全局配置**: 在 `/settings` 页面设置默认模型
2. **Agent独立配置**: 为不同Agent配置不同模型
3. **运行时配置**: API请求时传入配置覆盖默认值

### 配置参数
- `model`: 模型ID
- `temperature`: 温度参数 (0-1)
- `thinking`: 是否开启思考模式 (true/false)

## 开发规范

- **包管理**: 仅使用 `pnpm`
- **状态管理**: zustand (持久化存储)
- **主题**: 深色模式，teal色调
- **流式输出**: 后端 ReadableStream + SSE，前端 fetch + Reader
- **Agent协作**: 通过Orchestrator协调多个Agent
- **类型安全**: 严格的TypeScript类型检查

## 测试命令

```bash
# 类型检查
npx tsc --noEmit

# 服务检测
curl -I http://localhost:10929

# 知识库搜索测试
curl "http://localhost:10929/api/knowledge/search?q=SQL注入"

# 题目生成测试
curl -X POST -H 'Content-Type: application/json' \
  -d '{"action":"generateQuestion","language":"java"}' \
  http://localhost:10929/api/agent
```
