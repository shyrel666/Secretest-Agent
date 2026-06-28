import crypto from 'crypto';
import type {
  DiscoveredProjectAuditFindingSeed,
} from './types';
import type { ProjectId } from '../types';

export interface DiscoveredSeedIdentityInput {
  projectId: ProjectId;
  detectorId: string;
  path: string;
  symbol?: string;
  vulnerabilityType: string;
  standardReference: string;
  evidenceSummary: string;
}

function normalizeIdentityPart(value: string | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildDiscoveredSeedFingerprint(input: DiscoveredSeedIdentityInput): string {
  return [
    input.projectId,
    input.detectorId,
    normalizeIdentityPart(input.path),
    normalizeIdentityPart(input.symbol),
    normalizeIdentityPart(input.vulnerabilityType),
    normalizeIdentityPart(input.standardReference),
    normalizeIdentityPart(input.evidenceSummary),
  ].join('|');
}

export function buildDiscoveredSeedId(input: DiscoveredSeedIdentityInput): string {
  const digest = crypto
    .createHash('sha1')
    .update(buildDiscoveredSeedFingerprint(input))
    .digest('hex')
    .slice(0, 10);
  const normalizedProjectId = input.projectId.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `discovered-${normalizedProjectId}-${input.detectorId}-${digest}`;
}

export function deriveDiscoveredSeedFingerprint(seed: DiscoveredProjectAuditFindingSeed): string {
  if (seed.discovery.fingerprint) {
    return seed.discovery.fingerprint;
  }

  const primaryRef = seed.sourceRefs[0] || seed.evidenceFlow[0]?.ref;
  return buildDiscoveredSeedFingerprint({
    projectId: seed.projectId,
    detectorId: seed.discovery.detectorId,
    path: primaryRef?.path || '',
    symbol: primaryRef?.symbol,
    vulnerabilityType: seed.vulnerabilityType,
    standardReference: seed.standardReference,
    evidenceSummary: seed.evidenceFlow[0]?.summary || seed.discovery.reason,
  });
}
