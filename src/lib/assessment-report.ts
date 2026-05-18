import type { AssessmentLearningReport } from '@/lib/store/assessment';

export function hasLearningReportContent(report: AssessmentLearningReport | null | undefined): boolean {
  if (!report || typeof report !== 'object') {
    return false;
  }

  const path = (report as { learningPath?: unknown }).learningPath;
  if (!path || typeof path !== 'object') {
    return false;
  }

  const learningPath = path as Partial<Record<keyof AssessmentLearningReport['learningPath'], unknown>>;
  return [
    learningPath.strengths,
    learningPath.weaknesses,
    learningPath.recommendations,
    learningPath.nextTopics,
  ].some((items) => (
    Array.isArray(items)
    && items.some((item) => typeof item === 'string' && item.trim().length > 0)
  ));
}
