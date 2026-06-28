import fs from 'fs';
import path from 'path';
import {
  isProjectAuditTaskType,
  isProjectId,
  type ProjectAuditTaskType,
  type ProjectSourceRef,
} from '../types';
import type {
  DiscoveredProjectAuditFindingSeed,
  DiscoveredSeedStatus,
} from './types';
import { deriveDiscoveredSeedFingerprint } from './seed-identity';

export const DISCOVERED_SEEDS_PATH = path.resolve(
  process.cwd(),
  'data/project-audit/discovered-seeds.json',
);

let seedStoreLock: Promise<void> = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStatus(value: unknown): value is DiscoveredSeedStatus {
  return value === 'candidate' || value === 'approved' || value === 'rejected';
}

function isSourceRef(value: unknown): value is ProjectSourceRef {
  if (!isRecord(value)) {
    return false;
  }
  return isProjectId(value.projectId)
    && typeof value.path === 'string'
    && Number.isInteger(value.startLine)
    && Number.isInteger(value.endLine)
    && typeof value.role === 'string';
}

function normalizeTaskTypes(value: unknown): ProjectAuditTaskType[] {
  if (!Array.isArray(value)) {
    return ['identify'];
  }
  const taskTypes = value.filter(isProjectAuditTaskType);
  return taskTypes.length > 0 ? taskTypes : ['identify'];
}

function toDiscoveredSeed(value: unknown): DiscoveredProjectAuditFindingSeed | null {
  if (!isRecord(value) || !isProjectId(value.projectId)) {
    return null;
  }
  if (!isRecord(value.discovery) || !isStatus(value.discovery.status)) {
    return null;
  }
  if (!Array.isArray(value.sourceRefs) || !value.sourceRefs.every(isSourceRef)) {
    return null;
  }
  if (!Array.isArray(value.evidenceFlow)) {
    return null;
  }

  return {
    id: String(value.id || ''),
    projectId: value.projectId,
    title: String(value.title || ''),
    language: 'Java',
    difficulty: value.difficulty === 'easy' || value.difficulty === 'hard' ? value.difficulty : 'medium',
    standardReference: String(value.standardReference || ''),
    vulnerabilityType: String(value.vulnerabilityType || ''),
    sourceRefs: value.sourceRefs,
    evidenceFlow: value.evidenceFlow as DiscoveredProjectAuditFindingSeed['evidenceFlow'],
    taskTypes: normalizeTaskTypes(value.taskTypes),
    variantGuidance: String(value.variantGuidance || ''),
    distractorGuidance: Array.isArray(value.distractorGuidance)
      ? value.distractorGuidance.map(String)
      : [],
    remediationGuidance: Array.isArray(value.remediationGuidance)
      ? value.remediationGuidance.map(String)
      : [],
    discovery: {
      status: value.discovery.status,
      detectorId: String(value.discovery.detectorId || 'unknown'),
      confidence: typeof value.discovery.confidence === 'number' ? value.discovery.confidence : 0,
      generatedAt: String(value.discovery.generatedAt || ''),
      reason: String(value.discovery.reason || ''),
      fingerprint: typeof value.discovery.fingerprint === 'string'
        ? value.discovery.fingerprint
        : undefined,
    },
  } satisfies DiscoveredProjectAuditFindingSeed;
}

export function loadDiscoveredSeeds(
  filePath: string = DISCOVERED_SEEDS_PATH,
): DiscoveredProjectAuditFindingSeed[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  const items = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.seeds)
    ? parsed.seeds
    : [];

  return items
    .map(toDiscoveredSeed)
    .filter((seed): seed is DiscoveredProjectAuditFindingSeed => Boolean(seed && seed.id))
    .map((seed) => ({
      ...seed,
      discovery: {
        ...seed.discovery,
        fingerprint: deriveDiscoveredSeedFingerprint(seed),
      },
    }));
}

export function saveDiscoveredSeeds(
  seeds: DiscoveredProjectAuditFindingSeed[],
  filePath: string = DISCOVERED_SEEDS_PATH,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify({ seeds }, null, 2)}\n`, 'utf-8');
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

export async function withDiscoveredSeedStoreLock<T>(
  operation: () => T | Promise<T>,
): Promise<T> {
  const previous = seedStoreLock;
  let release!: () => void;
  seedStoreLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous.catch(() => undefined);

  try {
    return await operation();
  } finally {
    release();
  }
}

export function mergeDiscoveredSeedCandidates(
  existingSeeds: readonly DiscoveredProjectAuditFindingSeed[],
  candidateSeeds: readonly DiscoveredProjectAuditFindingSeed[],
): DiscoveredProjectAuditFindingSeed[] {
  const byId = new Map<string, DiscoveredProjectAuditFindingSeed>();
  const idByFingerprint = new Map<string, string>();

  for (const seed of existingSeeds) {
    const normalizedSeed = {
      ...seed,
      discovery: {
        ...seed.discovery,
        fingerprint: deriveDiscoveredSeedFingerprint(seed),
      },
    };
    byId.set(normalizedSeed.id, normalizedSeed);
    idByFingerprint.set(deriveDiscoveredSeedFingerprint(normalizedSeed), normalizedSeed.id);
  }

  for (const candidate of candidateSeeds) {
    const candidateWithFingerprint = {
      ...candidate,
      discovery: {
        ...candidate.discovery,
        fingerprint: deriveDiscoveredSeedFingerprint(candidate),
      },
    };
    const matchingId = byId.has(candidateWithFingerprint.id)
      ? candidateWithFingerprint.id
      : idByFingerprint.get(deriveDiscoveredSeedFingerprint(candidateWithFingerprint));
    const existing = matchingId ? byId.get(matchingId) : undefined;
    if (!existing) {
      byId.set(candidateWithFingerprint.id, candidateWithFingerprint);
      idByFingerprint.set(
        deriveDiscoveredSeedFingerprint(candidateWithFingerprint),
        candidateWithFingerprint.id,
      );
      continue;
    }

    byId.set(existing.id, {
      ...candidateWithFingerprint,
      id: existing.id,
      discovery: {
        ...candidateWithFingerprint.discovery,
        status: existing.discovery.status,
        generatedAt: existing.discovery.generatedAt || candidate.discovery.generatedAt,
        reason: existing.discovery.reason || candidate.discovery.reason,
      },
    });
  }

  return [...byId.values()].sort((left, right) => {
    if (left.projectId !== right.projectId) {
      return left.projectId.localeCompare(right.projectId);
    }
    return left.id.localeCompare(right.id);
  });
}

export function updateDiscoveredSeedStatus(
  seeds: readonly DiscoveredProjectAuditFindingSeed[],
  seedId: string,
  status: DiscoveredSeedStatus,
): {
  seeds: DiscoveredProjectAuditFindingSeed[];
  updated: DiscoveredProjectAuditFindingSeed | null;
} {
  let updated: DiscoveredProjectAuditFindingSeed | null = null;
  const nextSeeds = seeds.map((seed) => {
    if (seed.id !== seedId) {
      return seed;
    }

    updated = {
      ...seed,
      discovery: {
        ...seed.discovery,
        status,
      },
    };
    return updated;
  });

  return { seeds: nextSeeds, updated };
}
