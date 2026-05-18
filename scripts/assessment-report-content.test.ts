import assert from 'node:assert/strict';
import { hasLearningReportContent } from '../src/lib/assessment-report';

async function main() {
  assert.equal(
    hasLearningReportContent({
      learningPath: {
        strengths: [],
        weaknesses: [],
        recommendations: [],
        nextTopics: [],
      },
    }),
    false,
  );

  assert.equal(
    hasLearningReportContent({
      learningPath: {
        strengths: ['  '],
        weaknesses: [],
        recommendations: [],
        nextTopics: [],
      },
    }),
    false,
  );

  assert.equal(
    hasLearningReportContent({
      learningPath: {
        strengths: [],
        weaknesses: ['路径遍历需要加强'],
        recommendations: [],
        nextTopics: [],
      },
    }),
    true,
  );

  assert.doesNotThrow(() => {
    assert.equal(
      hasLearningReportContent({
        learningPath: {
          strengths: ['SQL注入识别稳定'],
        },
      } as never),
      true,
    );
  });

  assert.doesNotThrow(() => {
    assert.equal(
      hasLearningReportContent({
        learningPath: {
          weaknesses: '路径遍历需要加强',
        },
      } as never),
      false,
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
