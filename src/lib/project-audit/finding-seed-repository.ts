import {
  PROJECT_AUDIT_FINDING_SEEDS,
} from './source-code-findings';
import { loadDiscoveredSeeds } from './discovery/seed-store';
import type {
  DiscoveredProjectAuditFindingSeed,
} from './discovery/types';
import { isProjectId, type ProjectAuditFindingSeed, type ProjectId } from './types';

export interface FindingSeedRepositoryOptions {
  includeCandidates?: boolean;
  discoveredSeeds?: DiscoveredProjectAuditFindingSeed[];
}

function isEnabledDiscoveredSeed(
  seed: DiscoveredProjectAuditFindingSeed,
  includeCandidates: boolean,
): boolean {
  return seed.discovery.status === 'approved'
    || (includeCandidates && seed.discovery.status === 'candidate');
}

export function mergeProjectFindingSeeds(
  manualSeeds: readonly ProjectAuditFindingSeed[],
  discoveredSeeds: readonly DiscoveredProjectAuditFindingSeed[],
  options: Pick<FindingSeedRepositoryOptions, 'includeCandidates'> = {},
): ProjectAuditFindingSeed[] {
  const includeCandidates = Boolean(options.includeCandidates);
  const byId = new Map<string, ProjectAuditFindingSeed>();

  for (const seed of manualSeeds) {
    byId.set(seed.id, seed);
  }

  for (const seed of discoveredSeeds) {
    if (!isEnabledDiscoveredSeed(seed, includeCandidates)) {
      continue;
    }
    if (!byId.has(seed.id)) {
      byId.set(seed.id, seed);
    }
  }

  return [...byId.values()];
}

export function getAllProjectFindingSeeds(
  options: FindingSeedRepositoryOptions = {},
): ProjectAuditFindingSeed[] {
  const discoveredSeeds = options.discoveredSeeds || loadDiscoveredSeeds();
  return mergeProjectFindingSeeds(PROJECT_AUDIT_FINDING_SEEDS, discoveredSeeds, options);
}

export function getProjectFindingSeeds(
  projectId?: ProjectId,
  options: FindingSeedRepositoryOptions = {},
): ProjectAuditFindingSeed[] {
  const seeds = getAllProjectFindingSeeds(options);
  if (!projectId) {
    return seeds;
  }
  if (!isProjectId(projectId)) {
    return [];
  }
  return seeds.filter((seed) => seed.projectId === projectId);
}

export function getProjectFindingSeed(
  seedId: string,
  options: FindingSeedRepositoryOptions = {},
): ProjectAuditFindingSeed | null {
  return getAllProjectFindingSeeds(options).find((seed) => seed.id === seedId) || null;
}

export function getProjectSeedsByClause(
  clause: string,
  projectId?: ProjectId,
  options: FindingSeedRepositoryOptions = {},
): ProjectAuditFindingSeed[] {
  const normalized = clause.trim().toLowerCase();
  return getProjectFindingSeeds(projectId, options).filter(
    (seed) => seed.standardReference.toLowerCase().includes(normalized),
  );
}

export function getProjectSeedsByVulnerability(
  vulnerabilityType: string,
  projectId?: ProjectId,
  options: FindingSeedRepositoryOptions = {},
): ProjectAuditFindingSeed[] {
  const normalized = vulnerabilityType.trim().toLowerCase();
  return getProjectFindingSeeds(projectId, options).filter(
    (seed) => seed.vulnerabilityType.toLowerCase().includes(normalized),
  );
}

export function listProjectAuditFindingSeedIds(
  options: FindingSeedRepositoryOptions = {},
): string[] {
  return getAllProjectFindingSeeds(options).map((seed) => seed.id);
}
