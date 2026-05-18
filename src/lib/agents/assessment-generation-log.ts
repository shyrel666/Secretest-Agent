import path from 'path';
import { mkdir, appendFile } from 'fs/promises';
import type { AssessmentLanguage } from '@/lib/standards';

export interface AssessmentGenerationLogEntry {
  createdAt: string;
  durationMs: number;
  totalRequested: number;
  totalGenerated: number;
  language?: AssessmentLanguage;
  vulnerabilityType?: string;
  seedCandidateCount: number;
  reviewedCandidateCount: number;
  acceptedAfterReviewCount: number;
  supplementAttemptCount: number;
  duplicateTypeRejectCount: number;
  duplicateSimilarityRejectCount: number;
  reviewFailureCount: number;
  generationFailureCount: number;
  averageReviewScore: number | null;
  groundingIssueCount: number;
  success: boolean;
  errors: string[];
}

const LOG_DIR = path.join(process.cwd(), 'tmp');
const LOG_FILE = path.join(LOG_DIR, 'assessment-generation-quality.jsonl');

export async function writeAssessmentGenerationLog(entry: AssessmentGenerationLogEntry): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
}
