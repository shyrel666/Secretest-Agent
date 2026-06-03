import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitizeGenerationStageDetail } from '@/lib/sanitize-generation-stage-detail';

describe('sanitizeGenerationStageDetail', () => {
  it('removes vulnerability title from generation detail', () => {
    assert.equal(
      sanitizeGenerationStageDetail('正在生成 中等题：点击劫持…'),
      '正在生成 中等难度候选题…',
    );
  });

  it('keeps generic batch messages unchanged', () => {
    const message = '正在批量生成 中等难度候选题（3 道）…';
    assert.equal(sanitizeGenerationStageDetail(message), message);
  });
});
