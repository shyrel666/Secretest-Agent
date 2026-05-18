# Standard-Aligned Question Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated assessment questions measure clause-specific GB/T audit capability instead of only producing plausible vulnerability examples.

**Architecture:** Add a local standard-alignment quality gate that validates parsed questions before acceptance. The gate runs after schema sanitation for generator output and reviewer-corrected output, so fast review mode cannot bypass it. Strengthen generator and reviewer prompts to require clause-bound assessment objectives, observable evidence, and single-best-answer explanations while keeping the public `Question` API unchanged.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, zod schemas, existing `coze-coding-dev-sdk` agents, `tsx` script tests, `pnpm exec tsc`.

---

## File Structure

- Create `src/lib/agents/standard-alignment-validator.ts`
  - Owns local checks for standard reference alignment, code naturalness, answer-leaking code text, minimal auditability, ambiguity from multiple vulnerability signals, and explanation evidence linkage.
- Create `scripts/standard-alignment-validator.test.ts`
  - Script-based regression tests using `node:assert/strict` and `pnpm exec tsx`.
- Modify `src/lib/agents/question-generator-agent.ts`
  - Imports the validator.
  - Runs it after `parseQuestionOutput` and before `initialQuestions.push`.
  - Expands the generator prompt to center clause-specific assessment measurement.
- Modify `src/lib/agents/reviewer-agent.ts`
  - Imports the validator.
  - Runs it on `result.correctedQuestion || question` before grounding and before returning corrected questions.
  - Expands the reviewer prompt to audit standards-measurement quality.

---

### Task 1: Add Failing Tests for the Standard-Alignment Gate

**Files:**
- Create: `scripts/standard-alignment-validator.test.ts`
- Depends on future file: `src/lib/agents/standard-alignment-validator.ts`

- [ ] **Step 1: Write the failing test script**

Create `scripts/standard-alignment-validator.test.ts` with this content:

```ts
import assert from 'node:assert/strict';
import type { Question } from '../src/lib/agents/question-generator-agent';
import { validateStandardAlignedQuestion } from '../src/lib/agents/standard-alignment-validator';

const alignedQuestion: Question = {
  id: 'q_standard_aligned_sql',
  code: [
    'public User findByName(String name) {',
    '    String query = "SELECT id, name FROM users WHERE name = \'" + name + "\'";',
    '    return jdbcTemplate.queryForObject(query, User.class);',
    '}',
  ].join('\n'),
  language: 'Java',
  question: '根据对应标准条款，以下代码最需要关注哪类源代码安全问题？',
  options: ['SQL注入', '路径遍历', '整数溢出', '资源未释放'],
  correctAnswer: 0,
  explanation: '该题对应 GB/T 34944-2017 6.2.3.7。代码证据是外部输入 name 未经校验或参数化处理，直接通过字符串拼接进入 SQL 查询语句，审核时应判定为 SQL 注入风险。',
  difficulty: 'medium',
  vulnerabilityType: 'SQL注入',
  standardReference: 'GB/T 34944-2017 6.2.3.7',
};

function expectRejected(question: Question, issuePattern: RegExp) {
  const result = validateStandardAlignedQuestion(question);
  assert.equal(result.success, false);
  assert.ok(
    result.issues.some((issue) => issuePattern.test(issue)),
    `Expected issue matching ${issuePattern}, got: ${result.issues.join(' | ')}`,
  );
}

const accepted = validateStandardAlignedQuestion(alignedQuestion);
assert.equal(accepted.success, true, accepted.issues.join('；'));

expectRejected({
  ...alignedQuestion,
  code: [
    'public User findByName(String name) {',
    '    String sqlInjectionRisk = "SELECT id FROM users WHERE name = \'" + name + "\'";',
    '    return jdbcTemplate.queryForObject(sqlInjectionRisk, User.class);',
    '}',
  ].join('\n'),
}, /泄露答案|提示性/);

expectRejected({
  ...alignedQuestion,
  code: [
    'public User findByName(String name) {',
    '    // 这里存在SQL注入',
    '    String query = "SELECT id FROM users WHERE name = \'" + name + "\'";',
    '    return jdbcTemplate.queryForObject(query, User.class);',
    '}',
  ].join('\n'),
}, /注释|清洗/);

expectRejected({
  ...alignedQuestion,
  explanation: '用户输入会影响查询结果，应当修复。',
}, /标准条款|证据/);

expectRejected({
  ...alignedQuestion,
  code: 'return jdbcTemplate.queryForObject(sql, User.class);',
}, /过短|审计场景/);

expectRejected({
  ...alignedQuestion,
  code: [
    'public String readUserFile(String name, String fileName) {',
    '    String query = "SELECT id FROM users WHERE name = \'" + name + "\'";',
    '    jdbcTemplate.queryForObject(query, User.class);',
    '    return Files.readString(Paths.get("/srv/data", fileName));',
    '}',
  ].join('\n'),
}, /多个漏洞|答案不唯一/);
```

- [ ] **Step 2: Run the test to verify it fails because the validator does not exist**

Run:

```powershell
pnpm exec tsx scripts/standard-alignment-validator.test.ts
```

Expected result:

```text
Error: Cannot find module '../src/lib/agents/standard-alignment-validator'
```

The exact stack trace may include `tsx` internals. The important failure is the missing validator module.

---

### Task 2: Implement the Local Standard-Alignment Validator

**Files:**
- Create: `src/lib/agents/standard-alignment-validator.ts`
- Test: `scripts/standard-alignment-validator.test.ts`

- [ ] **Step 1: Create the validator implementation**

Create `src/lib/agents/standard-alignment-validator.ts` with this content:

```ts
import type { Question } from './question-generator-agent';
import { sanitizeQuestionCode } from './code-sanitizer';

export interface StandardAlignmentValidationResult {
  success: boolean;
  issues: string[];
}

const STANDARD_REFERENCE_RE = /^GB\/T\s*\d{4,5}-\d{4}\s+\d+(?:\.\d+)+$/;

const ANSWER_LEAK_PATTERNS: RegExp[] = [
  /\b(?:vuln|vulnerability|unsafe|dangerous|exploit|malicious|tainted|untrusted)\b/i,
  /\b(?:injection|traversal|overflow|deserialize|deserialization)\b/i,
  /漏洞|注入|越界|溢出|遍历|反序列化|不安全|危险/,
];

const EVIDENCE_TERMS = [
  '代码',
  '证据',
  '输入',
  '参数',
  '未经',
  '未',
  '直接',
  '调用',
  '拼接',
  '校验',
  '标准',
  '条款',
  '审核',
];

const VULNERABILITY_DETECTORS: Array<{
  type: string;
  pattern: RegExp;
}> = [
  {
    type: 'sql-injection',
    pattern: /\b(?:select|insert|update|delete)\b[\s\S]{0,160}(?:\+|\${|string\.format|format\s*\()/i,
  },
  {
    type: 'path-traversal',
    pattern: /\b(?:Paths?\.get|new\s+File|FileInputStream|readString|readAllBytes)\b[\s\S]{0,160}\b(?:fileName|path|name|request|getParameter|args)\b/i,
  },
  {
    type: 'command-injection',
    pattern: /\b(?:Runtime\.getRuntime\(\)\.exec|ProcessBuilder|system\s*\(|popen\s*\()\b[\s\S]{0,160}(?:\+|\bargs\b|\binput\b|\bcommand\b)/i,
  },
  {
    type: 'deserialization',
    pattern: /\b(?:ObjectInputStream|BinaryFormatter|JsonSerializer|readObject|Deserialize)\b/i,
  },
  {
    type: 'buffer-overflow',
    pattern: /\b(?:gets|strcpy|strcat|sprintf|memcpy)\s*\(/i,
  },
  {
    type: 'integer-overflow',
    pattern: /\b(?:int|long|size_t)\s+\w+\s*=\s*[\w.]+\s*[*+]\s*[\w.]+[\s\S]{0,160}\b(?:malloc|new\s+char|new\s+byte|Array\.CreateInstance)\b/i,
  },
];

export function validateStandardAlignedQuestion(question: Question): StandardAlignmentValidationResult {
  const issues: string[] = [];
  const code = question.code || '';
  const sanitizedCode = sanitizeQuestionCode(code);
  const normalizedCode = code.trim();
  const standardReference = question.standardReference.trim();
  const clauseNumber = standardReference.match(/(\d+(?:\.\d+)+)$/)?.[1] || '';

  if (!STANDARD_REFERENCE_RE.test(standardReference)) {
    issues.push('标准引用格式不正确，无法绑定到具体 GB/T 条款');
  }

  if (sanitizedCode !== normalizedCode) {
    issues.push('代码包含注释或需要清洗的提示性内容');
  }

  if (isCodeTooSmallForAuditScenario(sanitizedCode)) {
    issues.push('代码片段过短，缺少可测量的审计场景');
  }

  const leak = findAnswerLeak(sanitizedCode, question.vulnerabilityType);
  if (leak) {
    issues.push(`代码存在提示性命名或文本，可能泄露答案: ${leak}`);
  }

  const ambiguity = detectAmbiguousVulnerabilitySignals(sanitizedCode, question.vulnerabilityType);
  if (ambiguity.length > 1) {
    issues.push(`代码同时包含多个漏洞信号，可能导致答案不唯一: ${ambiguity.join('、')}`);
  }

  if (!explanationLinksClauseAndEvidence(question.explanation, standardReference, clauseNumber)) {
    issues.push('解析未同时说明标准条款和代码证据');
  }

  return {
    success: issues.length === 0,
    issues,
  };
}

function isCodeTooSmallForAuditScenario(code: string): boolean {
  const meaningfulLines = code
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return code.length < 80 || meaningfulLines.length < 3;
}

function findAnswerLeak(code: string, vulnerabilityType: string): string | null {
  const searchableCode = removeStringLiteralValues(code);
  const normalizedCode = normalizeForLeakSearch(searchableCode);
  const normalizedType = normalizeForLeakSearch(vulnerabilityType);

  for (const pattern of ANSWER_LEAK_PATTERNS) {
    const match = searchableCode.match(pattern);
    if (match?.[0]) {
      return match[0];
    }
  }

  const typeTokens = normalizedType
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((token) => token.length >= 3 && token !== 'sql');

  for (const token of typeTokens) {
    if (normalizedCode.includes(token)) {
      return token;
    }
  }

  return null;
}

function removeStringLiteralValues(code: string): string {
  return code
    .replace(/@"(?:""|[^"])*"/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

function normalizeForLeakSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-./()（）,，:：]/g, ' ')
    .trim();
}

function detectAmbiguousVulnerabilitySignals(code: string, vulnerabilityType: string): string[] {
  const normalizedType = normalizeForLeakSearch(vulnerabilityType);
  const detected = VULNERABILITY_DETECTORS
    .filter((detector) => detector.pattern.test(code))
    .map((detector) => detector.type);

  if (detected.length <= 1) {
    return detected;
  }

  const targetDetector = detected.find((type) => normalizedType.includes(type.replace('-', ' ')));
  if (!targetDetector) {
    return detected;
  }

  const nonTargetSignals = detected.filter((type) => type !== targetDetector);
  return nonTargetSignals.length === 0 ? [targetDetector] : detected;
}

function explanationLinksClauseAndEvidence(
  explanation: string,
  standardReference: string,
  clauseNumber: string,
): boolean {
  const normalizedExplanation = explanation.toLowerCase();
  const mentionsClause = normalizedExplanation.includes(standardReference.toLowerCase())
    || Boolean(clauseNumber && normalizedExplanation.includes(clauseNumber));
  const evidenceTermCount = EVIDENCE_TERMS.filter((term) => explanation.includes(term)).length;

  return mentionsClause && evidenceTermCount >= 2;
}
```

- [ ] **Step 2: Run the validator test to verify it passes**

Run:

```powershell
pnpm exec tsx scripts/standard-alignment-validator.test.ts
```

Expected result:

```text
<no output, exit code 0>
```

- [ ] **Step 3: Run the existing comment sanitizer regression test**

Run:

```powershell
pnpm exec tsx scripts/agent-comment-sanitizer.test.ts
```

Expected result:

```text
<no output, exit code 0>
```

---

### Task 3: Integrate the Gate into Generator and Reviewer Paths

**Files:**
- Modify: `src/lib/agents/question-generator-agent.ts`
- Modify: `src/lib/agents/reviewer-agent.ts`
- Test: `scripts/standard-alignment-validator.test.ts`
- Test: `scripts/agent-comment-sanitizer.test.ts`

- [ ] **Step 1: Import the validator in the question generator**

Modify the imports at the top of `src/lib/agents/question-generator-agent.ts` so the validator import is present:

```ts
import { parseQuestionOutput } from './output-schemas';
import { sanitizeQuestionCode } from './code-sanitizer';
import { validateStandardAlignedQuestion } from './standard-alignment-validator';
```

- [ ] **Step 2: Reject generator output that fails standard alignment**

In `src/lib/agents/question-generator-agent.ts`, inside the `for (const [index, rawQuestion] of questions.entries())` loop, replace the block after `if (!validation.success) { ... continue; }` with:

```ts
        const alignment = validateStandardAlignedQuestion(validation.question);
        if (!alignment.success) {
          schemaIssues.push(`题目 ${index + 1}: ${alignment.issues.join('；')}`);
          continue;
        }

        if (normalizeVulnerabilityType(validation.question.vulnerabilityType)) {
          initialQuestions.push(validation.question);
        }
```

This keeps rejection reasons in existing generation issue reporting.

- [ ] **Step 3: Import the validator in the reviewer**

Modify the imports at the top of `src/lib/agents/reviewer-agent.ts` so this line is present:

```ts
import { validateStandardAlignedQuestion } from './standard-alignment-validator';
```

- [ ] **Step 4: Reject reviewer-corrected output that fails standard alignment**

In `src/lib/agents/reviewer-agent.ts`, immediately after this existing line:

```ts
      const result: ReviewResult = validation.review;
```

insert:

```ts
      const alignedQuestion = result.correctedQuestion || question;
      const alignment = validateStandardAlignedQuestion(alignedQuestion);
      if (!alignment.success) {
        return {
          success: false,
          result,
          usage: createEstimatedUsage({
            messages,
            completionText: response.content,
          }),
          retrievalTrace: [
            ...(clauseContext?.retrievalTrace || []),
            ...searchResult.retrievalTrace,
          ],
          error: `题目未通过标准对齐校验：${alignment.issues.join('；')}`,
        };
      }
```

Leave the existing line below it in place:

```ts
      const groundedQuestion = toGroundingCandidate(result.correctedQuestion || question);
```

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
pnpm exec tsx scripts/standard-alignment-validator.test.ts
pnpm exec tsx scripts/agent-comment-sanitizer.test.ts
```

Expected result for each command:

```text
<no output, exit code 0>
```

---

### Task 4: Strengthen Generator and Reviewer Prompts for Standards Measurement

**Files:**
- Modify: `src/lib/agents/question-generator-agent.ts`
- Modify: `src/lib/agents/reviewer-agent.ts`

- [ ] **Step 1: Add measurement rules to the generator system prompt**

In `src/lib/agents/question-generator-agent.ts`, in `QUESTION_GENERATOR_PROMPT`, add these rules under `## 出题要求` after the existing item 7:

```text
8. **标准能力测量**：每道题必须先锚定一个具体 GB/T 条款，再围绕该条款要求的审核能力构造代码场景，不能只根据泛化漏洞名称出题
9. **可观察证据**：代码中必须包含用户可审计的证据链，例如输入来源、数据处理路径、敏感操作或安全控制缺失
10. **单一最佳答案**：代码只能设置一个主要安全问题，避免同时出现多个强漏洞信号导致选项答案不唯一
11. **自然业务代码**：代码应像真实业务函数，禁止使用 unsafe、vuln、risk、injection、漏洞、注入等会提示答案的命名或字符串
12. **解析绑定条款**：explanation 必须说明对应标准条款、代码证据、为什么正确选项最符合该条款，以及为什么其他选项不如正确答案
```

- [ ] **Step 2: Add standard-alignment requirements to the generator user prompt**

In the user prompt content in `src/lib/agents/question-generator-agent.ts`, add these lines inside the `要求：` list:

```text
- 出题前先从知识片段中选择一个明确条款，抽象出该条款要测量的审核能力，再生成题目
- 题目代码必须体现“输入来源 → 数据处理 → 敏感操作/缺失控制”的可观察证据链
- 解析必须显式写出标准条款编号，并说明代码中的具体证据如何对应条款要求
- 禁止在代码变量名、函数名、字符串、类名中出现会泄露答案的词，例如 unsafe、vuln、risk、injection、漏洞、注入
```

- [ ] **Step 3: Add measurement criteria to the reviewer system prompt**

In `src/lib/agents/reviewer-agent.ts`, in `REVIEWER_PROMPT`, add these review standards after the existing numbered list:

```text

你不是在审核一道普通安全题，而是在审核“标准能力测量题”。必须额外检查：
7. 题目是否锚定一个具体 GB/T 条款，而不是泛泛引用标准
8. 代码是否能测量该条款要求的审核能力
9. 代码证据是否足够支持唯一正确答案
10. 选项是否围绕条款判定设计，错误选项不能与正确选项语义等价
11. 解析是否说明标准条款、代码证据、正确答案依据和错误选项排除理由
12. 代码中是否存在 unsafe、vuln、risk、injection、漏洞、注入等提示性命名或字符串
```

- [ ] **Step 4: Add corrected-question instruction to the reviewer prompt**

In `REVIEWER_PROMPT`, after the paragraph about copied example code, add:

```text

如果提供 correctedQuestion，修正后的题目必须仍然绑定同一类标准条款，并且代码必须是无注释、无答案提示命名、单一主要漏洞、可审计证据清晰的自然业务代码。
```

- [ ] **Step 5: Run type checking**

Run:

```powershell
pnpm exec tsc -p tsconfig.json --noEmit
```

Expected result:

```text
<no output, exit code 0>
```

---

### Task 5: Final Verification

**Files:**
- Verify all modified files from Tasks 1-4.

- [ ] **Step 1: Run all targeted regression checks**

Run:

```powershell
pnpm exec tsx scripts/standard-alignment-validator.test.ts
pnpm exec tsx scripts/agent-comment-sanitizer.test.ts
pnpm exec tsc -p tsconfig.json --noEmit
```

Expected result for each command:

```text
<no output, exit code 0>
```

- [ ] **Step 2: Confirm fast review cannot bypass the local gate**

Inspect `src/lib/agents/question-generator-agent.ts` and confirm generator output enters `initialQuestions` only after:

```ts
const alignment = validateStandardAlignedQuestion(validation.question);
if (!alignment.success) {
  schemaIssues.push(`题目 ${index + 1}: ${alignment.issues.join('；')}`);
  continue;
}
```

Inspect `src/lib/agents/reviewer-agent.ts` and confirm reviewer-corrected output is rejected with:

```ts
error: `题目未通过标准对齐校验：${alignment.issues.join('；')}`,
```

- [ ] **Step 3: Check git availability**

Run:

```powershell
git status --short
```

Expected result in the current desktop workspace:

```text
fatal: not a git repository (or any of the parent directories): .git
```

If this plan is executed from a real git worktree, commit only the files changed by this plan:

```powershell
git add src/lib/agents/standard-alignment-validator.ts src/lib/agents/question-generator-agent.ts src/lib/agents/reviewer-agent.ts scripts/standard-alignment-validator.test.ts docs/superpowers/plans/2026-04-25-standard-aligned-question-generation.md docs/superpowers/specs/2026-04-25-standard-aligned-question-generation-design.md
git commit -m "feat: enforce standard-aligned question generation"
```

---

## Self-Review

- Spec coverage: The plan covers clause anchoring, code scenario quality, single-best-answer control, standards-based explanations, fast review gate enforcement, prompt contract changes, and testing.
- Scope: The plan does not change knowledge ingestion, PDF parsing, UI, scoring, or stored question-bank schema.
- Type consistency: The validator exports `validateStandardAlignedQuestion(question: Question): StandardAlignmentValidationResult`, and all integration steps use that name.
- API compatibility: The public `Question` shape remains unchanged.
