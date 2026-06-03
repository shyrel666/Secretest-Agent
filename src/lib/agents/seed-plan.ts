export type SeedDifficulty = 'easy' | 'medium' | 'hard';

/** 按题目序号推断难度：前 30% 简单、30%~80% 中等、其余困难 */
export function getDifficultyForIndex(index: number, total: number): SeedDifficulty {
  if (index < total * 0.3) {
    return 'easy';
  }

  if (index < total * 0.8) {
    return 'medium';
  }

  return 'hard';
}

/**
 * 为每道待出题目生成一个种子槽位（每槽固定 1 题），并按序号锚定一个覆盖目标。
 * 覆盖目标数量不足时，多出来的槽位 target 为 undefined（由生成器自由选型）。
 */
export function buildSeedPlan<T>(
  total: number,
  coverageTargets: T[],
): Array<{ difficulty: SeedDifficulty; count: 1; target?: T }> {
  return Array.from({ length: total }, (_, index) => ({
    difficulty: getDifficultyForIndex(index, total),
    count: 1,
    target: coverageTargets[index],
  }));
}
