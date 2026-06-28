import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildProjectQuestionContext,
  formatProjectContextBriefForPrompt,
} from '@/lib/project-audit/project-context-builder';
import { getProjectFindingSeed } from '@/lib/project-audit/source-code-findings';

describe('project-context-builder prompt formatting', () => {
  it('builds a compact audit brief for LLM source-project generation', () => {
    const seed = getProjectFindingSeed('ympt-upload-extension-only');
    assert.ok(seed);

    const context = buildProjectQuestionContext(seed, 'identify');
    const brief = formatProjectContextBriefForPrompt(context);

    assert.match(brief, /PROJECT_AUDIT_BRIEF/);
    assert.match(brief, /EVIDENCE_MAP/);
    assert.match(brief, /SOURCE_SNIPPETS/);
    assert.match(brief, /QUESTION_DESIGN_CONSTRAINTS/);
    assert.match(brief, /四个 options 必须使用同一种语法形态/);
    assert.match(brief, /JSON 可省略 sourceRefs\/evidenceFlow/);
    assert.doesNotMatch(brief, /## 源码项目背景/);
    assert.ok(brief.length < 6000, `brief should stay small enough for quick LLM reading, got ${brief.length}`);
  });
});
