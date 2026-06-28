/**
 * 项目源码模式下的 seed 选择策略。
 *
 * 规则：
 * - sourceProject: 'YM_PT' | 'itstec-24'  → 只从该项目 seed 池选
 * - sourceProject: 'all'                    → 两个项目混合
 * - 混合模式下尽量保证至少覆盖 2 个项目（当 total >= 5 时）
 * - 已覆盖过的 finding id 可以从 coveredSeedIds 中排除
 * - 难度按总题数均匀分布 easy/medium/hard
 */

import { getProjectFindingSeeds } from './finding-seed-repository';
import {
  isProjectId,
  type ProjectAuditFindingSeed,
  type ProjectAuditTaskType,
  type ProjectId,
  type ProjectMode,
  type ProjectSeedPlanEntry,
  type SeedDifficulty,
  type SourceProjectSelection,
} from './types';

export interface ProjectSeedPlanOptions {
  total: number;
  sourceProject?: SourceProjectSelection;
  projectMode?: ProjectMode;
  coveredSeedIds?: string[];
  /** 按 findingSeedId → 已答次数，过滤已答多的 seed，优先选未答过的 */
  answerCountBySeedId?: Record<string, number>;
  /** 强制首选的 taskType 集合；未提供则按 seed.taskTypes 轮换。 */
  preferredTaskTypes?: ProjectAuditTaskType[];
}

const DIFFICULTY_DISTRIBUTION: Array<{ difficulty: SeedDifficulty; ratio: number }> = [
  { difficulty: 'easy', ratio: 0.3 },
  { difficulty: 'medium', ratio: 0.5 },
  { difficulty: 'hard', ratio: 0.2 },
];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function difficultyForIndex(index: number, total: number): SeedDifficulty {
  if (total <= 0) {
    return 'medium';
  }
  const ratio = index / total;
  if (ratio < DIFFICULTY_DISTRIBUTION[0].ratio) {
    return 'easy';
  }
  if (ratio < DIFFICULTY_DISTRIBUTION[0].ratio + DIFFICULTY_DISTRIBUTION[1].ratio) {
    return 'medium';
  }
  return 'hard';
}

function pickTaskType(
  seed: ProjectAuditFindingSeed,
  preferred?: ProjectAuditTaskType[],
  projectMode?: ProjectMode,
): ProjectAuditTaskType {
  if (projectMode === 'variant') {
    return 'variant';
  }
  if (projectMode === 'source') {
    const allowed = seed.taskTypes.filter((task) => task !== 'variant');
    if (allowed.length === 0) {
      return seed.taskTypes[0];
    }
    return allowed[Math.floor(Math.random() * allowed.length)];
  }
  if (preferred && preferred.length > 0) {
    const overlap = seed.taskTypes.filter((task) => preferred.includes(task));
    if (overlap.length > 0) {
      return overlap[Math.floor(Math.random() * overlap.length)];
    }
  }
  return seed.taskTypes[Math.floor(Math.random() * seed.taskTypes.length)];
}

function collectSeedPool(
  sourceProject: SourceProjectSelection | undefined,
): ProjectAuditFindingSeed[] {
  if (sourceProject && sourceProject !== 'all') {
    if (!isProjectId(sourceProject)) {
      return [];
    }
    return getProjectFindingSeeds(sourceProject);
  }
  return getProjectFindingSeeds();
}

function ensureProjectCoverage(
  selected: ProjectSeedPlanEntry[],
  candidates: ProjectAuditFindingSeed[],
  targetCoverage: Set<ProjectId>,
  total: number,
  options: Pick<ProjectSeedPlanOptions, 'preferredTaskTypes' | 'projectMode'>,
): void {
  if (total < 5) {
    return;
  }
  for (const projectId of targetCoverage) {
    if (selected.some((entry) => entry.seed.projectId === projectId)) {
      continue;
    }
    const candidate = candidates.find(
      (seed) => seed.projectId === projectId && !selected.some((entry) => entry.seed.id === seed.id),
    );
    if (!candidate) {
      continue;
    }
    const nextEntry: ProjectSeedPlanEntry = {
      seed: candidate,
      taskType: pickTaskType(candidate, options.preferredTaskTypes, options.projectMode),
      difficulty: candidate.difficulty,
    };

    if (selected.length < total) {
      selected.push(nextEntry);
      continue;
    }

    const projectCounts = new Map<ProjectId, number>();
    for (const entry of selected) {
      projectCounts.set(entry.seed.projectId, (projectCounts.get(entry.seed.projectId) || 0) + 1);
    }

    const replaceIndex = [...selected]
      .map((entry, index) => ({ entry, index }))
      .reverse()
      .find(({ entry }) => (
        entry.seed.projectId !== projectId
        && (projectCounts.get(entry.seed.projectId) || 0) > 1
      ))?.index;

    if (replaceIndex != null) {
      selected[replaceIndex] = nextEntry;
    }
  }
}

export function buildProjectSeedPlan(options: ProjectSeedPlanOptions): ProjectSeedPlanEntry[] {
  const total = Math.max(options.total, 0);
  if (total === 0) {
    return [];
  }

  const candidates = collectSeedPool(options.sourceProject);
  if (candidates.length === 0) {
    return [];
  }

  const covered = new Set(options.coveredSeedIds || []);
  const answerCount = options.answerCountBySeedId || {};

  // 过滤掉 covered；如全被 covered 覆盖则回退到全量，让用户至少能继续练习（用内容近似度去重兜底）
  let pool = candidates.filter((seed) => !covered.has(seed.id));
  if (pool.length === 0) {
    pool = candidates;
  }

  // 按 answerCount 升序、id 随机排序
  pool = shuffle(pool).sort((a, b) => (answerCount[a.id] || 0) - (answerCount[b.id] || 0));

  // 混合项目模式：total >= 5 时覆盖目标项目集合
  const wantCrossProject = options.sourceProject === 'all' || !options.sourceProject;
  const targetProjects: Set<ProjectId> = wantCrossProject && total >= 5
    ? new Set(['YM_PT', 'itstec-24'])
    : new Set();

  const selected: ProjectSeedPlanEntry[] = [];
  const remaining = [...pool];

  for (let index = 0; index < total; index++) {
    const difficulty = difficultyForIndex(index, total);

    // 1. 优先按难度挑选
    let choice = remaining.find((seed) => seed.difficulty === difficulty && !selected.some((entry) => entry.seed.id === seed.id))
      || remaining.find((seed) => !selected.some((entry) => entry.seed.id === seed.id));

    if (!choice) {
      break;
    }

    selected.push({
      seed: choice,
      taskType: pickTaskType(choice, options.preferredTaskTypes, options.projectMode),
      difficulty,
    });
  }

  // 2. 跨项目覆盖补齐
  if (targetProjects.size > 0) {
    ensureProjectCoverage(selected, candidates, targetProjects, total, {
      preferredTaskTypes: options.preferredTaskTypes,
      projectMode: options.projectMode,
    });
  }

  // 3. 补齐到 total
  while (selected.length < total) {
    const candidate = remaining.find((seed) => !selected.some((entry) => entry.seed.id === seed.id));
    if (!candidate) {
      break;
    }
    selected.push({
      seed: candidate,
      taskType: pickTaskType(candidate, options.preferredTaskTypes, options.projectMode),
      difficulty: candidate.difficulty,
    });
  }

  return selected.slice(0, total);
}
