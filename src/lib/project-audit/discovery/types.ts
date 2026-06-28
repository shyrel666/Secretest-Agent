import type {
  ProjectAuditFindingSeed,
  ProjectAuditTaskType,
  ProjectId,
  ProjectSourceRef,
  SeedDifficulty,
} from '../types';

export type DiscoveredSeedStatus = 'candidate' | 'approved' | 'rejected';

export interface DiscoveryMetadata {
  status: DiscoveredSeedStatus;
  detectorId: string;
  confidence: number;
  generatedAt: string;
  reason: string;
  fingerprint?: string;
}

export interface DiscoveredProjectAuditFindingSeed extends ProjectAuditFindingSeed {
  discovery: DiscoveryMetadata;
}

export interface IndexedProjectSourceFile {
  projectId: ProjectId;
  path: string;
  absolutePath: string;
  extension: string;
  content: string;
  lines: string[];
}

export interface DetectorMatch {
  lineNumber: number;
  lineText: string;
}

export interface RuleDetectorDefinition {
  id: string;
  standardReference: string;
  vulnerabilityType: string;
  difficulty: SeedDifficulty;
  confidence: number;
  taskTypes: ProjectAuditTaskType[];
  label: string;
  variantGuidance: string;
  distractorGuidance: string[];
  remediationGuidance: string[];
  match(file: IndexedProjectSourceFile): DetectorMatch[];
  summarizeEvidence(match: DetectorMatch, file: IndexedProjectSourceFile): string;
  buildSourceRef(file: IndexedProjectSourceFile, match: DetectorMatch): ProjectSourceRef;
}
