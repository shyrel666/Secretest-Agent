# Source Code Project-Grounded Assessment Implementation Plan

## Goal

把当前能力测评出题从“基于 GB/T 34944 知识库临场生成漏洞代码片段”，升级为“基于 `source_code/` 下真实能力验证项目源码证据的代码审计测评”。

当前源码根目录：

```text
source_code/
  YM_PT/
  itstec-24/
```

目标出题模型：

```text
source_code/<projectId> 真实代码点
-> GB/T 34944-2017 具体条款
-> 审计能力目标
-> 文件/方法/调用链证据
-> 题目类型
-> 单一最佳答案
-> 基于项目证据的解析
```

第一阶段同时支持 `YM_PT` 和 `itstec-24` 两个 Java 项目。实现上不要再写死 `YM_PT`，而是以 `source_code/<projectId>` 为源码项目根，后续新增能力验证源码项目时只需要新增 project profile 和 finding seeds。

## Current State

现有出题链路已经完成了“标准条款对齐”：

- `src/lib/agents/question-generator-agent.ts` 从知识库检索 GB/T 条款片段，调用 LLM 生成题目。
- `src/lib/agents/standard-alignment-validator.ts` 校验题目是否绑定具体标准条款、代码是否自然、解析是否包含条款和证据。
- `src/lib/agents/reviewer-agent.ts` 对候选题做二次审核和 grounded 校验。
- `src/lib/agents/orchestrator.ts` 控制题目集生成、难度分布、去重、补题和 fast review。
- `src/app/api/agent/route.ts` 对外提供 `generateQuestion`、`generateQuizSet` 等 action。
- `src/lib/store/assessment.ts` 和 `src/components/assessment/*` 只展示当前 `Question` 的代码、选项、解析、难度、语言和标准引用。

当前缺口：

- 题目代码主要由模型根据标准片段构造，和 `source_code/` 下的真实项目源码缺少强绑定。
- 题目没有记录项目名、文件路径、行号、调用链、source-sink 证据。
- 生成器和审核器不知道哪些漏洞点来自哪个源码项目，也无法判断“举一反三题”是否仍来自真实源码模式。
- 题库保存时只保存 `question_text/code/language/options/...`，没有保存项目证据元数据。

## Source Project Inventory

### YM_PT

医疗/体检报告类 Spring Boot 项目，主要模块：

- `admin`
- `doctor`
- `report`
- `user`
- `filter`
- `common/security`
- MyBatis XML mapper

适合训练：

- Controller -> Service -> Mapper 数据流追踪
- Cookie/session 授权判断
- 命令执行、路径处理、上传处理
- 密码和加密 API 审计
- 配置文件敏感信息审计

### itstec-24

支付/用户/日志类 Spring Boot 项目，主要模块：

- `pay`
- `user`
- `log`
- `common/crytodec`
- `common/sign`
- `base/util`

适合训练：

- 登录重定向与会话状态
- 日志路径、归档、压缩、命令执行
- Excel 批量导入/更新中的 SQL 拼接
- 上传文件名和 MIME/后缀校验
- 支付接口签名/加密过滤器
- 硬编码密钥、ECB 模式、MD5 签名、配置口令

## Finding Seeds

第一阶段使用人工确认的 finding seeds。每个 seed 必须绑定真实源码、GB/T 34944 条款、主漏洞类型和题目类型。

### YM_PT Confirmed Seeds

| Seed ID | Source Evidence | Clause | Vulnerability Type | Suggested Tasks |
| --- | --- | --- | --- | --- |
| `ympt-sql-order-injection` | `source_code/YM_PT/src/org/itstec/report/controller/ReportController.java:180` 接收 `order`，`ReportServiceImpl.java:113` 透传，`source_code/YM_PT/src/resources/mapper/ReportMapper.xml:52` 使用 `${order}` | `GB/T 34944-2017 6.2.3.4` | SQL 注入 | trace, identify, fix |
| `ympt-sql-subject-false-positive` | `ReportController.java:155` 接收 `subject/condition`，`ReportServiceImpl.java:103` 经 `checkSubject/checkCond` 白名单后进入 `ReportMapper.xml:44` `${subject} ${condition}` | `GB/T 34944-2017 6.2.3.4` | SQL 注入误报排除 | falsePositive, trace |
| `ympt-command-arch` | `ReportController.java:88` 接收 `para`，`ReportServiceImpl.java:60` 拼接到 `cmd[2]` 后 `Runtime.getRuntime().exec(cmd)` | `GB/T 34944-2017 6.2.3.3` | 命令注入 | trace, fix |
| `ympt-reflection-custom` | `ReportController.java:206` 接收 `cName`，`Class.forName(cName)` 后反射实例化并调用 `handle(request)` | `GB/T 34944-2017 6.2.3.5` | 代码注入 | identify, fix |
| `ympt-cookie-admin-auth` | `AdminController.java:41` 设置 `adminID` Cookie，`AdminController.java:63` 读取 Cookie，并在 `AdminController.java:74` 用 `account.equals(adminID)` 授权添加医生 | `GB/T 34944-2017 6.2.6.15` | 依赖未经验证和完整性检查的 cookie | trace, identify |
| `ympt-missing-login-query-user-list` | `DoctorController.java:117` `/doctor/queryUserList` 直接用请求中的 `account` 查询用户列表，没有调用 `checkLogin` | `GB/T 34944-2017 6.2.6.12` | 关键参数篡改 | identify, fix |
| `ympt-relative-path-show-arch-file` | `DoctorController.java:148` 接收 `dCode`，`DoctorServiceImpl.java` 拼接 `"D:/itstec/doctor/"+dCode` 后列目录 | `GB/T 34944-2017 6.2.3.1` | 相对路径遍历 | trace, fix |
| `ympt-des-hardcoded-key` | `DESUtil.java:14` 使用 DES，`DESUtil.java:15` 硬编码 key | `GB/T 34944-2017 6.2.6.3` / `6.2.6.7` | 口令硬编码 / 危险加密算法 | identify |
| `ympt-aes-fixed-gcm-iv` | `AESUtil.java:44` 使用固定 IV 执行 `AES/GCM/NoPadding` | `GB/T 34944-2017 6.2.6.9` | 密码分组链接模式未使用随机初始化矢量 | identify, fix |
| `ympt-secutil-weak-random` | `SecUtil.java:31` 使用 `new Random()` 生成加密 IV | `GB/T 34944-2017 6.2.6.10` | 不充分的随机数 | identify |
| `ympt-sensitive-log-phone` | `UserServiceImpl.java:75` 解密手机号，`UserServiceImpl.java:76` 以 info 日志输出 | `GB/T 34944-2017 6.2.3.8` | 信息通过服务器日志文件泄露 | identify |
| `ympt-cookie-sensitive-user-info` | `UserController.java:123` 查询用户信息，`UserController.java:133` 和 `UserController.java:138` 把手机号/地址写入 Cookie | `GB/T 34944-2017 6.2.6.5` / `6.2.3.10` | Cookie 中的敏感信息明文存储 | identify, fix |
| `ympt-config-db-password` | `source_code/YM_PT/src/application.yml:7` 使用 root，`application.yml:8` 明文数据库口令 | `GB/T 34944-2017 6.2.6.3` | 口令硬编码 | identify |
| `ympt-upload-extension-only` | `UserController.java:98` 上传图片，`UserServiceImpl.java:113` 依赖原始文件名后缀，`UserServiceImpl.java:134` 写入磁盘 | `GB/T 34944-2017 6.2.4.1` / `6.2.8.5` | 未限制危险类型文件的上传 | identify, fix |

### YM_PT Candidate Seeds Requiring Manual Confirmation

| Candidate ID | Source Evidence | Reason |
| --- | --- | --- |
| `ympt-redirect-page-candidate` | `UserController.java:42` 接收 `page`，`UserController.java:51` 返回 `"redirect:" + page` | 该类标注 `@RestController`，返回字符串可能作为响应体而非 Spring MVC redirect。需要确认运行时行为后再判定是否为 `GB/T 34944-2017 6.2.8.4` 开放重定向。 |
| `ympt-charset-response-candidate` | `ReportController.java:139` 接收 `charSet`，`ReportController.java:148` 拼接到 `Content-Type` header | 需要确认 Servlet 容器是否拒绝 CR/LF，以及是否形成 HTTP 响应拆分或 XSS 条件。 |

### itstec-24 Confirmed Seeds

| Seed ID | Source Evidence | Clause | Vulnerability Type | Suggested Tasks |
| --- | --- | --- | --- | --- |
| `itstec24-open-redirect-login` | `source_code/itstec-24/src/org/itstec/user/controller/UserController.java:45` 接收 `url`，`UserServiceImpl.java:106` 登录成功后 `newUrl=url`，`UserController.java:48` 返回 `"redirect:" + newUrl` | `GB/T 34944-2017 6.2.8.4` | 开放重定向 | trace, identify, fix |
| `itstec24-log-arch-command` | `LogController.java:37` 接收 `para`，`LogServiceImpl.java:101` 进入 `logArch`，`LogServiceImpl.java:107` 拼接到 `cmd[2]`，`LogServiceImpl.java:108` 执行 `Runtime.getRuntime().exec(cmd)` | `GB/T 34944-2017 6.2.3.3` | 命令注入 | trace, fix |
| `itstec24-log-path-listing` | `LogController.java:23` 接收 `logPath`，`LogServiceImpl.java:33` 进入 `show`，`LogServiceImpl.java:35` 检查目录，`LogServiceImpl.java:38` 列出目录内容 | `GB/T 34944-2017 6.2.3.1` / `6.2.3.2` | 路径遍历 | trace, identify |
| `itstec24-log-grab-path-zip` | `LogController.java:27` 接收 `logPath`，`LogServiceImpl.java:64` 进入 `logGrab`，`LogServiceImpl.java:70` 构造 zip 路径，`LogServiceImpl.java:71` 压缩用户指定目录，`LogServiceImpl.java:73` 复制 zip | `GB/T 34944-2017 6.2.3.1` / `6.2.3.2` | 路径遍历 | trace, fix |
| `itstec24-excel-update-sql-concat` | `UserController.java:71` 上传 Excel，`UserServiceImpl.java:232` 进入 `updateBatchInfo`，`UserServiceImpl.java:269` 执行 `dbbean.executeUpdate(update + set + where)` | `GB/T 34944-2017 6.2.3.4` | SQL 注入 | trace, fix |
| `itstec24-excel-import-sql-concat` | `UserController.java:103` 上传 Excel 和 `memorySize`，`UserServiceImpl.java:291` 进入 `importBatchInfo`，`UserServiceImpl.java:307` 执行 `dbbean.executeUpdate(insert + values)` | `GB/T 34944-2017 6.2.3.4` | SQL 注入 | trace, fix |
| `itstec24-upload-original-filename` | `UserController.java:66` 上传图片，`UserServiceImpl.java:170` 使用 `getOriginalFilename()`，`UserServiceImpl.java:207` 拼接原始文件名写入磁盘，`UserServiceImpl.java:208` `Files.write` | `GB/T 34944-2017 6.2.8.5` / `6.2.4.1` | 依赖外部提供的文件名或扩展名 | identify, fix |
| `itstec24-filter-hardcoded-key` | `OrderFilter.java:94` 硬编码 `password = "CTGYUwnw"`，用于请求验签、响应签名和 AES 加解密 | `GB/T 34944-2017 6.2.6.3` | 口令硬编码 | identify |
| `itstec24-aes-ecb-mode` | `AesUtil.java:31` 和 `AesUtil.java:53` 使用 `AES/ECB/PKCS5Padding` | `GB/T 34944-2017 6.2.6.7` | 使用已破解或危险的加密算法 | identify, fix |
| `itstec24-md5-signature` | `SignUtils.java:33` 和 `SignUtils.java:58` 记录签名前串，`SignUtils.java:67` 使用 MD5 计算签名 | `GB/T 34944-2017 6.2.6.8` / `6.2.3.8` | 可逆/弱散列算法与日志泄露 | identify, falsePositive |
| `itstec24-session-never-expire` | `UserServiceImpl.java:84` 登录时调用 `session.setMaxInactiveInterval(-1)` | `GB/T 34944-2017 6.2.7.2` | 会话永不过期 | identify |
| `itstec24-payment-sign-bypass` | `PayController.java:72` `getByIdCardNo` 使用 `@CryptoDecryptionSignSecurity(requestDecryption=false, requestSign=false, partialCrySign={"idCardNo"})` 关闭请求解密和签名 | `GB/T 34944-2017 6.2.6.12` / `6.2.5.2` | 关键参数篡改 / 违反信任边界 | identify, trace |
| `itstec24-config-db-password` | `source_code/itstec-24/src/application.yml:4` 远程 MySQL 地址且 `allowMultiQueries=true`，`application.yml:5` 用户名，`application.yml:6` 明文数据库口令 | `GB/T 34944-2017 6.2.6.3` | 口令硬编码 | identify |
| `itstec24-insecure-random-discount` | `OrderServiceImpl.java:60` 使用 `new Random().nextInt()` 生成优惠金额 | `GB/T 34944-2017 6.2.6.10` | 不充分的随机数 | identify |

### itstec-24 Candidate Seeds Requiring Manual Confirmation

| Candidate ID | Source Evidence | Reason |
| --- | --- | --- |
| `itstec24-hardcoded-notify-url-candidate` | `OrderServiceImpl.java:81` 拼接固定 HTTP 地址 `http://101.101.101.101:8081//order/getById?orderNo=` 并追加订单号 | 可能对应敏感信息明文传输、SSRF 或业务通知地址错误，但当前 URL 域名固定，需确认真实攻击面。 |
| `itstec24-log-xss-folder-name-candidate` | `LogServiceImpl.java:42` 将目录名拼接到 HTML/JS `onclick` 中 | 目录名是否可由外部攻击者控制需要确认；确认后可映射到 `GB/T 34944-2017 6.2.8.1`。 |

## Target Architecture

### New Modules

新增 `src/lib/project-audit/`，作为项目源码审计出题的深层 Module。

```text
src/lib/project-audit/
  types.ts
  project-registry.ts
  source-code-findings.ts
  source-reader.ts
  project-context-builder.ts
  project-grounding-validator.ts
  project-seed-plan.ts
  __tests__/
    project-registry.test.ts
    source-code-findings.test.ts
    source-reader.test.ts
    project-grounding-validator.test.ts
```

Module 责任：

- `types.ts` 定义项目证据、finding seed、题目元数据、题型。
- `project-registry.ts` 维护 `source_code/` 下可用源码项目：`YM_PT`、`itstec-24`。
- `source-code-findings.ts` 保存第一阶段人工确认的多项目 finding seeds。
- `source-reader.ts` 只读地从 `source_code/<projectId>` 读取指定行号片段，必须防止路径逃逸。
- `project-context-builder.ts` 将 seed 转换成给 LLM 的项目上下文，包含项目名、文件、行号、代码片段、证据流、变体要求。
- `project-grounding-validator.ts` 校验题目是否真的绑定对应 project seed，解析是否引用真实文件/方法/证据。
- `project-seed-plan.ts` 按项目、难度、题型、覆盖率、已答历史选择 seeds。

### Data Types

新增类型建议：

```ts
export type ProjectId = 'YM_PT' | 'itstec-24';

export type ProjectAuditTaskType =
  | 'identify'
  | 'trace'
  | 'fix'
  | 'falsePositive'
  | 'variant';

export interface SourceCodeProjectProfile {
  id: ProjectId;
  name: string;
  root: string;
  language: 'Java';
  description: string;
}

export interface ProjectSourceRef {
  projectId: ProjectId;
  path: string;
  startLine: number;
  endLine: number;
  role: 'entry' | 'controller' | 'service' | 'mapper' | 'sink' | 'config' | 'utility' | 'evidence';
  symbol?: string;
}

export interface ProjectEvidenceStep {
  label: string;
  ref: ProjectSourceRef;
  summary: string;
}

export interface ProjectAuditFindingSeed {
  id: string;
  projectId: ProjectId;
  title: string;
  language: 'Java';
  difficulty: 'easy' | 'medium' | 'hard';
  standardReference: string;
  vulnerabilityType: string;
  sourceRefs: ProjectSourceRef[];
  evidenceFlow: ProjectEvidenceStep[];
  taskTypes: ProjectAuditTaskType[];
  variantGuidance: string;
  distractorGuidance: string[];
  remediationGuidance: string[];
}

export interface ProjectQuestionMetadata {
  sourceProject: ProjectId;
  auditTaskType: ProjectAuditTaskType;
  findingSeedId: string;
  variantOfFindingId?: string;
  sourceRefs: ProjectSourceRef[];
  evidenceFlow: ProjectEvidenceStep[];
}
```

扩展现有 `Question` 和 `AssessmentQuestion`，新增字段全部可选，保证旧题目兼容：

```ts
sourceProject?: ProjectId;
auditTaskType?: ProjectAuditTaskType;
findingSeedId?: string;
variantOfFindingId?: string;
sourceRefs?: ProjectSourceRef[];
evidenceFlow?: ProjectEvidenceStep[];
```

## Generation Strategy

### Question Mix

源码项目模式下建议题目组成：

- 60% 到 70% 真实源码审计题：直接展示 `source_code/<projectId>` 文件片段和调用链。
- 20% 到 30% 同构变体题：基于 seed 的漏洞模式改写局部业务代码，标记 `variantOfFindingId`。
- 10% 到 20% 修复或误报排除题：给修复方案、白名单逻辑或相似代码，要求判断是否仍存在风险。

### Project Selection Rules

- `sourceProject` 指定为某个项目时，只从该项目 seeds 出题。
- `sourceProject` 为 `all` 或未指定但启用项目模式时，可在 `YM_PT` 和 `itstec-24` 间混合抽题。
- 混合项目模式下，同一套 5 题以上测评应尽量覆盖至少 2 个项目。
- 如果用户选择非 Java 语言，项目源码模式应禁用或给出明确错误，因为当前两个源码项目都是 Java。

### Difficulty Rules

- `easy`：单文件、单 sink、证据明显。例如硬编码口令、固定 IV、ECB、明文配置、会话永不过期。
- `medium`：Controller -> Service -> Mapper 或 Controller -> Service -> 文件/命令操作。例如 SQL 注入、命令注入、路径遍历。
- `hard`：需要区分真实风险与误报，或比较多个参数谁真正可控。例如 `YM_PT` 的 `subject/condition/order`，或 `itstec-24` 的签名/加密注解组合。

### Prompt Contract

项目源码题的生成器提示词必须新增约束：

```text
你现在不是自由编写漏洞片段，而是在基于 source_code/<projectId> 真实源码出题。

必须遵守：
1. 优先使用提供的真实源码片段，不能改变项目名、文件路径、方法名、关键调用链和危险 sink。
2. 若题型为 variant，只能变更业务表述和局部变量，必须保留 seed 的漏洞模式、source -> processing -> sink 结构。
3. question 必须让用户完成代码审计任务，而不是只问泛化漏洞名称。
4. explanation 必须引用源码项目名、文件路径、方法名、关键代码证据和 GB/T 条款。
5. 选项必须有单一最佳答案，错误选项不得对应同一代码中的另一个强漏洞。
6. 对 falsePositive 题，正确答案必须说明为什么该点不是主要漏洞，真正风险或安全控制在哪里。
```

## Implementation Tasks

### Task 1: Add Project Audit Domain Types

Files:

- Create `src/lib/project-audit/types.ts`
- Modify `src/lib/agents/question-generator-agent.ts`
- Modify `src/lib/store/assessment.ts`
- Modify `src/lib/agents/output-schemas.ts`

Steps:

- [ ] Define `ProjectId`, `ProjectAuditTaskType`, `SourceCodeProjectProfile`, `ProjectSourceRef`, `ProjectEvidenceStep`, `ProjectAuditFindingSeed`, `ProjectQuestionMetadata`.
- [ ] Extend `Question` with optional project metadata fields.
- [ ] Extend client-side `AssessmentQuestion` with the same optional fields.
- [ ] Update `questionOutputSchema` to accept optional project metadata. Keep existing fields required.
- [ ] Add schema validation that any `sourceProject` requires non-empty `sourceRefs` and `findingSeedId`.
- [ ] Reject unknown `sourceProject` values outside project registry.

Acceptance:

- Old standard-only generated questions still parse.
- A project-grounded question with `sourceProject/sourceRefs/evidenceFlow` parses.
- Unknown project IDs are rejected.

### Task 2: Create Source Code Project Registry and Finding Catalog

Files:

- Create `src/lib/project-audit/project-registry.ts`
- Create `src/lib/project-audit/source-code-findings.ts`
- Create `src/lib/project-audit/__tests__/project-registry.test.ts`
- Create `src/lib/project-audit/__tests__/source-code-findings.test.ts`

Steps:

- [ ] Encode project profiles:
  - `YM_PT` -> `source_code/YM_PT`
  - `itstec-24` -> `source_code/itstec-24`
- [ ] Encode the confirmed seeds from this document as `ProjectAuditFindingSeed[]`.
- [ ] Keep seed IDs stable because answer history and coverage logic may later depend on them.
- [ ] For each seed, include at least one `entry/controller/config` ref and one `sink/mapper/service/evidence` ref.
- [ ] Add helper functions:
  - `listSourceCodeProjects()`
  - `getSourceCodeProject(projectId)`
  - `getProjectFindingSeeds(projectId?)`
  - `getProjectFindingSeed(seedId)`
  - `getProjectSeedsByClause(projectId, standardReference)`
  - `getProjectSeedsByVulnerability(projectId, vulnerabilityType)`

Acceptance:

- Project IDs are unique.
- Seed IDs are unique across all projects.
- Every seed has valid `projectId`, `language: 'Java'`, valid `standardReference`, source refs, and at least one task type.
- Every source ref path points under the registered `source_code/<projectId>/` root.

### Task 3: Add Safe Source Reader

Files:

- Create `src/lib/project-audit/source-reader.ts`
- Create `src/lib/project-audit/__tests__/source-reader.test.ts`

Steps:

- [ ] Implement `readProjectSourceSnippet(ref: ProjectSourceRef)`.
- [ ] Resolve paths against `process.cwd()` and reject any path escaping the workspace or registered project root.
- [ ] Return:
  - project profile,
  - normalized relative path,
  - requested start/end lines,
  - actual code,
  - line-numbered code for prompt context.
- [ ] Use UTF-8 read. Do not modify source files.

Acceptance:

- Reading `source_code/YM_PT/src/org/itstec/report/controller/ReportController.java:180-195` returns the expected `queryCustOrder` snippet.
- Reading `source_code/itstec-24/src/org/itstec/log/service/impl/LogServiceImpl.java:101-109` returns the expected `logArch` snippet.
- A path containing `..` outside the registered project root is rejected.
- Missing files or invalid line ranges produce structured errors.

### Task 4: Build Project Context for Generation

Files:

- Create `src/lib/project-audit/project-context-builder.ts`
- Create `src/lib/project-audit/project-seed-plan.ts`
- Modify `src/lib/agents/orchestrator.ts`

Steps:

- [ ] Implement `buildProjectQuestionContext(seed, taskType)` that combines:
  - project profile,
  - seed metadata,
  - line-numbered source snippets,
  - evidence flow,
  - standard reference,
  - variant/fix/false-positive guidance.
- [ ] Implement `buildProjectSeedPlan(total, options)` to choose seeds by:
  - selected project or all projects,
  - requested language,
  - difficulty distribution,
  - uncovered vulnerability types,
  - task-type mix.
- [ ] In `AgentOrchestrator.generateQuizSet`, add optional params:
  - `sourceProject?: ProjectId | 'all'`
  - `projectMode?: 'source' | 'variant' | 'mixed'`
- [ ] When source project mode is enabled, use `buildProjectSeedPlan` instead of `buildCoverageExpansionTargets`.
- [ ] Keep existing standard-only path as fallback.

Acceptance:

- Requesting `sourceProject: 'YM_PT'` returns only `YM_PT` seed entries.
- Requesting `sourceProject: 'itstec-24'` returns only `itstec-24` seed entries.
- Requesting `sourceProject: 'all'` can mix both projects.
- Existing `generateQuizSet` behavior remains unchanged when project mode is omitted.

### Task 5: Add Project-Grounded Question Generation

Files:

- Modify `src/lib/agents/question-generator-agent.ts`
- Modify `src/lib/agents/reviewer-agent.ts`

Steps:

- [ ] Add `projectContext?: ProjectQuestionContext` to `QuestionGeneratorAgent.generateQuestion`.
- [ ] If project context is present, include it in the user prompt after GB/T knowledge context.
- [ ] In source mode, require generated `code` to be the provided source bundle or a selected excerpt from it.
- [ ] In variant mode, require `variantOfFindingId` and require the code to preserve the seed pattern.
- [ ] Update `REVIEWER_PROMPT` so reviewer checks:
  - project ID and file/path evidence,
  - source refs,
  - whether explanation names the actual project evidence,
  - whether variant still tests the same seed pattern.
- [ ] Reviewer-corrected questions must preserve project metadata.

Acceptance:

- Generated project question includes `sourceProject`, `findingSeedId`, `sourceRefs`, and `auditTaskType`.
- Explanation references both the GB/T clause and at least one source project file path or method name.
- Reviewer cannot drop source metadata in `correctedQuestion`.

### Task 6: Add Project Grounding Validator

Files:

- Create `src/lib/project-audit/project-grounding-validator.ts`
- Create `src/lib/project-audit/__tests__/project-grounding-validator.test.ts`
- Modify `src/lib/agents/question-generator-agent.ts`
- Modify `src/lib/agents/reviewer-agent.ts`

Steps:

- [ ] Implement `validateProjectGroundedQuestion(question, seed)`.
- [ ] Validate:
  - `sourceProject` matches seed project.
  - `findingSeedId` exists.
  - `standardReference` matches seed.
  - `vulnerabilityType` is compatible with seed.
  - `sourceRefs` are non-empty and subset of seed refs for source mode.
  - `explanation` mentions project ID, file/method evidence.
  - source mode code overlaps with source snippets above a threshold.
  - variant mode code is not a direct copy but still contains required pattern markers.
- [ ] Run this validator after `validateStandardAlignedQuestion`.
- [ ] Add rejection reasons to existing generation/reviewer issue collections.

Acceptance:

- A question claiming `YM_PT` or `itstec-24` but missing source refs is rejected.
- A question with seed `ympt-sql-order-injection` but `standardReference` not equal to `GB/T 34944-2017 6.2.3.4` is rejected.
- A question with seed `itstec24-log-arch-command` but code unrelated to `source_code/itstec-24` is rejected.
- Standard-only questions are not passed through this validator.

### Task 7: Preserve Project Metadata in Question Bank

Files:

- Modify `src/lib/question-bank/sqlite-store.ts`
- Modify question bank API/UI files if they deserialize `QuestionRecord`

Steps:

- [ ] Add nullable `metadata_json` column to `question_records`.
- [ ] Store project metadata from `AssessmentQuestionInput`.
- [ ] Extend `QuestionRecord` / `QuestionWithStats` with optional project metadata.
- [ ] Keep existing rows valid with `metadata_json IS NULL`.
- [ ] Keep `questionText + code` hash stable unless duplicate behavior requires metadata inclusion.

Acceptance:

- Completing a project-grounded quiz saves source metadata.
- Reloading question bank does not lose source refs.
- Existing question bank rows continue loading.

### Task 8: Expose Project Mode Through API

Files:

- Modify `src/app/api/agent/route.ts`
- Modify `src/app/assessment/page.tsx`
- Modify `src/components/assessment/assessment-setup-workspace.tsx`

Steps:

- [ ] Accept request body fields:
  - `sourceProject?: ProjectId | 'all'`
  - `projectMode?: 'source' | 'variant' | 'mixed'`
- [ ] Pass these fields into `orchestrator.generateQuizSet`.
- [ ] Add setup UI option:
  - “真实项目源码训练”
  - project selector: all / YM_PT / itstec-24
  - mode selector: source / mixed / variant
- [ ] Default behavior:
  - If language is Java, project mode can be enabled.
  - If language is C/C++ or C#, project mode should show clear text that current source projects are Java-only.
- [ ] Keep standard-only assessment available.

Acceptance:

- `/api/agent` standard-only requests remain backward compatible.
- Project mode request generates Java questions grounded in selected source project(s).
- UI prevents selecting project mode for C/C++ and C#.

### Task 9: Display Source Evidence in Quiz UI

Files:

- Modify `src/components/assessment/quiz-session-workspace.tsx`
- Modify `src/components/assessment/assessment-code-block.tsx` only if line-number handling needs adjustment.
- Optionally create `src/components/assessment/project-source-evidence.tsx`

Steps:

- [ ] Show a compact “源码证据” area above or below the code block when `question.sourceProject` exists.
- [ ] Display:
  - project name,
  - audit task type,
  - finding seed ID or readable title,
  - source refs with path and line range,
  - evidence flow steps.
- [ ] Do not expose the vulnerability answer in visible metadata.
- [ ] Keep mobile layout compact and non-overlapping.

Acceptance:

- Project questions show enough source context for real audit practice.
- Standard-only questions render exactly as before.
- Evidence labels do not leak the correct answer.

### Task 10: Update Explainer and Learning Report

Files:

- Modify `src/lib/agents/explainer-agent.ts`
- Modify `src/lib/agents/orchestrator.ts`
- Modify report UI only if needed

Steps:

- [ ] Include project metadata in explanation prompt.
- [ ] Require detailed explanation to cite:
  - source project,
  - source file,
  - method,
  - data flow,
  - dangerous operation or missing control,
  - GB/T clause.
- [ ] In `generateLearningReport`, summarize weak points by:
  - project,
  - vulnerability type,
  - audit task type,
  - missed evidence-flow step.

Acceptance:

- Wrong-answer explanation teaches how to trace the actual source project code path.
- Learning report can say “itstec-24 命令注入的数据流追踪薄弱” instead of only “命令注入薄弱”.

### Task 11: Tests and Verification

Files:

- Add tests under `src/lib/project-audit/__tests__/`
- Update existing tests if schemas change

Commands:

```powershell
pnpm exec tsc -p tsconfig.json --noEmit
pnpm test
pnpm test:knowledge
```

Manual verification:

```powershell
curl -X POST -H 'Content-Type: application/json' `
  -d '{"action":"generateQuizSet","language":"java","totalQuestions":5,"sourceProject":"all","projectMode":"mixed"}' `
  http://localhost:10929/api/agent

curl -X POST -H 'Content-Type: application/json' `
  -d '{"action":"generateQuizSet","language":"java","totalQuestions":3,"sourceProject":"itstec-24","projectMode":"source"}' `
  http://localhost:10929/api/agent
```

Expected checks:

- [ ] All project-mode questions are Java.
- [ ] Every project question has `sourceProject`.
- [ ] Every project question has at least one `sourceRefs` item.
- [ ] Explanations mention GB/T clause and actual project evidence.
- [ ] In `sourceProject: "all"` mode, 5 题以上尽量覆盖 `YM_PT` 和 `itstec-24`。
- [ ] No question uses answer-leaking identifiers added by the model.

## Rollout Plan

### Phase 1: Multi-Project Source-Grounded MVP

Scope:

- Add types, project registry, seed catalog, source reader, context builder.
- Generate source-mode questions only.
- Add project grounding validator.
- No UI selector yet; API can accept `sourceProject: 'YM_PT' | 'itstec-24' | 'all'`.

Exit criteria:

- API can generate 3 to 5 source-grounded Java questions for `YM_PT`.
- API can generate 3 to 5 source-grounded Java questions for `itstec-24`.
- Mixed project mode can generate a set containing both projects when enough questions are requested.
- Tests pass.
- Generated questions cite real paths and line ranges.

### Phase 2: UI and Persistence

Scope:

- Add assessment setup selector.
- Display source evidence in quiz.
- Persist metadata in question bank.

Exit criteria:

- User can choose all / YM_PT / itstec-24 project mode from assessment page.
- Completed quiz keeps source metadata after reload and question bank save.

### Phase 3: Variant and False-Positive Training

Scope:

- Enable `variant` and `falsePositive` task types.
- Add variant-specific validation.
- Add seed coverage logic by project, task type, and vulnerability type.

Exit criteria:

- Same seed can produce direct source question and same-pattern variant without becoming a free-form fake snippet.
- False-positive questions explicitly test why a candidate is or is not the main issue.

## Quality Bar

Project-grounded questions are acceptable only when all conditions hold:

- The question has exactly one best answer.
- The answer can be justified from visible source project code evidence.
- The standard reference is concrete and matches the seed.
- The explanation names both the GB/T clause and the relevant source evidence.
- Source-mode code is not fabricated by the model.
- Variant-mode code preserves the seed vulnerability pattern and records `variantOfFindingId`.
- Distractors test common mistakes, not unrelated trivia.

## Risks

- **Line drift**: If files under `source_code/` change, seed line numbers may become stale. Mitigate by tests that read every seed ref.
- **Answer leakage**: Source evidence labels could reveal the vulnerability. Mitigate by keeping labels generic, such as `入口参数`, `业务处理`, `数据访问`, `系统调用`.
- **Overfitting to one project**: User may memorize one project’s line numbers. Mitigate with mixed project mode, controlled variants, and repair tasks.
- **False positive ambiguity**: Some candidate risks depend on framework behavior. Keep them in candidate seeds until confirmed.
- **Schema compatibility**: Existing stored questions lack project metadata. Use optional fields and nullable `metadata_json`.

## Definition of Done

- `YM_PT` and `itstec-24` project profiles are registered.
- Both projects' finding seeds are encoded and tested.
- Project source snippets are read safely from disk.
- Project mode generation works through `/api/agent`.
- Project questions pass both standard alignment and project grounding validators.
- Quiz UI can show source evidence without leaking answers.
- Question bank preserves project metadata.
- `pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm test`, and `pnpm test:knowledge` pass.
