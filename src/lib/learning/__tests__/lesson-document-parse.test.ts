import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_MISSING_ANSWER_FALLBACK,
  buildLessonQualityWarnings,
  normalizeLearningLessonPayload,
  normalizePracticeQuestionEntry,
  parseNormalizedLearningLessonDocument,
} from '@/lib/learning/lesson-document-parse';

describe('normalizePracticeQuestionEntry', () => {
  it('maps answer alias to answerMarkdown', () => {
    const normalized = normalizePracticeQuestionEntry({
      questionMarkdown: '题面 A',
      answer: '答案 A',
    });

    assert.deepEqual(normalized, {
      questionMarkdown: '题面 A',
      answerMarkdown: '答案 A',
      answerSource: 'alias',
    });
  });

  it('splits embedded answer section from questionMarkdown with newline', () => {
    const normalized = normalizePracticeQuestionEntry({
      questionMarkdown: '题面 B\n参考答案：要点 B',
    });

    assert.deepEqual(normalized, {
      questionMarkdown: '题面 B',
      answerMarkdown: '要点 B',
      answerSource: 'embedded',
    });
  });

  it('splits embedded answer section on the same line', () => {
    const normalized = normalizePracticeQuestionEntry({
      questionMarkdown: '题面 C 参考答案：要点 C',
    });

    assert.deepEqual(normalized, {
      questionMarkdown: '题面 C',
      answerMarkdown: '要点 C',
      answerSource: 'embedded',
    });
  });
});

describe('normalizeLearningLessonPayload', () => {
  it('fills missing answerMarkdown from legacy practice questions', () => {
    const normalized = normalizeLearningLessonPayload({
      contentMarkdown: '1. 本章你会学到什么\n正文',
      practiceQuestions: [
        { questionMarkdown: '题 1', answerMarkdown: '答 1' },
        { questionMarkdown: '题 2' },
        { questionMarkdown: '题 3', answer: '答 3' },
      ],
    }, {
      legacyPracticeQuestions: [
        { questionMarkdown: 'legacy 1', answerMarkdown: 'legacy 答 1' },
        { questionMarkdown: 'legacy 2', answerMarkdown: 'legacy 答 2' },
        { questionMarkdown: 'legacy 3', answerMarkdown: 'legacy 答 3' },
      ],
    });

    assert.equal(normalized?.practiceQuestions[1].answerMarkdown, 'legacy 答 2');
    assert.equal(normalized?.practiceQuestions[2].answerMarkdown, '答 3');
    assert.deepEqual(normalized?.diagnostics.legacyAnswerIndexes, [1]);
    assert.deepEqual(normalized?.diagnostics.aliasAnswerIndexes, [2]);
  });

  it('uses fallback when answerMarkdown is missing and legacy is unavailable', () => {
    const normalized = normalizeLearningLessonPayload({
      contentMarkdown: '1. 本章你会学到什么\n正文',
      practiceQuestions: [
        { questionMarkdown: '题 1', answerMarkdown: '答 1' },
        { questionMarkdown: '题 2' },
        { questionMarkdown: '题 3' },
      ],
    });

    assert.equal(normalized?.practiceQuestions[1].answerMarkdown, DEFAULT_MISSING_ANSWER_FALLBACK);
    assert.equal(normalized?.practiceQuestions[2].answerMarkdown, DEFAULT_MISSING_ANSWER_FALLBACK);
    assert.deepEqual(normalized?.diagnostics.fallbackAnswerIndexes, [1, 2]);
  });

  it('returns null when practiceQuestions count is not 3', () => {
    const normalized = normalizeLearningLessonPayload({
      contentMarkdown: '1. 本章你会学到什么\n正文',
      practiceQuestions: [
        { questionMarkdown: '题 1', answerMarkdown: '答 1' },
        { questionMarkdown: '题 2', answerMarkdown: '答 2' },
      ],
    });

    assert.equal(normalized, null);
  });

  it('sorts object-shaped practiceQuestions by numeric keys', () => {
    const normalized = normalizeLearningLessonPayload({
      contentMarkdown: '1. 本章你会学到什么\n正文',
      practiceQuestions: {
        '2': { questionMarkdown: '题 3', answerMarkdown: '答 3' },
        '0': { questionMarkdown: '题 1', answerMarkdown: '答 1' },
        '1': { questionMarkdown: '题 2', answerMarkdown: '答 2' },
      },
    });

    assert.deepEqual(
      normalized?.practiceQuestions.map((question) => question.questionMarkdown),
      ['题 1', '题 2', '题 3'],
    );
  });

  it('parses normalized payload with zod schema', () => {
    const normalized = normalizeLearningLessonPayload({
      contentMarkdown: '1. 本章你会学到什么\n正文',
      practiceQuestions: [
        { questionMarkdown: '题 1', answerMarkdown: '答 1' },
        { questionMarkdown: '题 2', answer: '答 2' },
        { questionMarkdown: '题 3', solution: '答 3' },
      ],
    });

    assert.ok(normalized);
    const parsed = parseNormalizedLearningLessonDocument(normalized!);
    assert.equal(parsed.practiceQuestions.length, 3);
    assert.equal(parsed.practiceQuestions[1].answerMarkdown, '答 2');
  });
});

describe('buildLessonQualityWarnings', () => {
  it('builds fallback warning message for affected questions', () => {
    const warnings = buildLessonQualityWarnings({
      answerSources: ['answerMarkdown', 'fallback', 'fallback'],
      fallbackAnswerIndexes: [1, 2],
      legacyAnswerIndexes: [],
      aliasAnswerIndexes: [],
    });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /第 2、3 道/);
    assert.match(warnings[0], /重新生成本章/);
  });
});
