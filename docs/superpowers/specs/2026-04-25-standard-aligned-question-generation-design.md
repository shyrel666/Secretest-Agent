# Standard-Aligned Question Generation Design

## Purpose

Assessment questions should measure whether a learner can audit code against the corresponding GB/T source-code vulnerability testing standard. A generated question is not acceptable merely because it contains a plausible vulnerability. It must be anchored to one standard clause and test the review capability implied by that clause.

The target generation model is:

```text
GB/T clause -> assessment objective -> code scenario -> observable evidence -> single best answer -> standards-based explanation
```

## Success Criteria

- Each question binds to one concrete `standardReference` in the format already enforced by the schema.
- The code scenario demonstrates the audit capability required by that clause, not just a generic vulnerability label.
- The question has one best answer, with distractors that are plausible but not equivalent to the correct clause-based judgment.
- The explanation cites the clause and explains the observable evidence in the code.
- The generated code remains natural business code, without comments, leak-prone variable names, or instructional wording.
- Fast review mode cannot bypass local standard-alignment and code-quality checks.

## Scope

This design covers question generation, review, and local validation for assessment questions. It does not change knowledge ingestion, PDF parsing, user answer scoring, or the UI layout.

## Architecture

### Prompt Contract

The question generator prompt should require the model to first derive a clause-specific assessment objective from the selected knowledge snippets, then generate a question from that objective. The final JSON can remain compatible with the current `Question` shape, but the generation instructions should include internal fields conceptually:

- `assessmentObjective`: what audit ability this question measures.
- `observableEvidence`: code facts the learner should notice.
- `misconceptionTargets`: why wrong options may attract weaker answers.

These fields do not need to be exposed to the frontend in the first implementation. They can be embedded in the prompt and explanation requirements while preserving API compatibility.

### Local Quality Gate

Add a local validator that runs after schema parsing and before acceptance by the orchestrator. It should reject or flag questions with:

- missing or malformed standard clause references,
- code that contains comments or answer-leaking names,
- vulnerability labels or standard terms embedded in identifiers or strings,
- code that is too short to demonstrate input source, processing, and sensitive operation,
- multiple strong vulnerabilities that make the answer ambiguous,
- explanation that does not connect the code evidence to the standard clause.

This gate must run for both initial generator output and reviewer-corrected questions, so fast review mode cannot skip it.

### Reviewer Agent

The reviewer prompt should shift from generic security-question review to standards-measurement review. It should evaluate:

- clause alignment,
- auditability of the code evidence,
- answer uniqueness,
- distractor quality,
- code naturalness,
- whether the explanation teaches the clause-based judgment.

If a corrected question is returned, it must pass the same schema and local quality gate as generator output.

## Data Flow

1. `QuestionGeneratorAgent` retrieves candidate knowledge snippets.
2. The prompt asks the model to choose one clause and derive a measurable audit objective.
3. The model returns the existing question JSON.
4. `parseQuestionOutput` sanitizes and validates structure.
5. The local standard-alignment validator checks code quality and clause-based measurement quality.
6. Grounding validation confirms the question is supported by retrieved standard evidence.
7. `Orchestrator` either fast-accepts only if all local gates pass or sends the question to `ReviewerAgent`.
8. Reviewer-corrected questions repeat schema, local gate, and grounding checks before use.

## Error Handling

If the local gate rejects a question, generation should retry instead of showing the question to the user. Rejection reasons should be added to grounding or generation issues for logs, for example:

- `代码命名泄露答案: unsafeSql`
- `解析未说明标准条款下的可观察证据`
- `题目同时包含 SQL 注入和路径遍历，答案不唯一`

## Testing

Add unit-style tests around the local validator:

- accepts a natural clause-aligned SQL injection question,
- rejects answer-leaking identifiers such as `unsafeSql` or `sqlInjectionRisk`,
- rejects comments and instructional strings in code,
- rejects explanations that omit clause/evidence linkage,
- confirms reviewer-corrected questions pass through the same gate.

Run `pnpm exec tsc -p tsconfig.json --noEmit` after implementation.

## Implementation Notes

Keep API compatibility in the first pass. Do not add required public fields to `Question` unless the UI and stored question bank are migrated together. Prefer a local helper such as `validateStandardAlignedQuestion(question)` under `src/lib/agents/`.
