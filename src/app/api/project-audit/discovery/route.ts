import { NextRequest, NextResponse } from 'next/server';
import {
  discoverProjectFindingCandidates,
  listRuleDetectorIds,
} from '@/lib/project-audit/discovery/rule-detectors';
import {
  loadDiscoveredSeeds,
  mergeDiscoveredSeedCandidates,
  saveDiscoveredSeeds,
  updateDiscoveredSeedStatus,
  withDiscoveredSeedStoreLock,
} from '@/lib/project-audit/discovery/seed-store';
import {
  isDiscoveryRequestAllowed,
  parseDiscoveryProjectSelection,
} from '@/lib/project-audit/discovery/api-guards';
import type {
  DiscoveredProjectAuditFindingSeed,
  DiscoveredSeedStatus,
} from '@/lib/project-audit/discovery/types';
import {
  isProjectId,
  PROJECT_IDS,
  type ProjectId,
  type SourceProjectSelection,
} from '@/lib/project-audit/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DiscoveryProjectSelection = SourceProjectSelection;

function isDiscoveryStatus(value: unknown): value is DiscoveredSeedStatus {
  return value === 'candidate' || value === 'approved' || value === 'rejected';
}

function resolveProjectIds(selection: DiscoveryProjectSelection): ProjectId[] {
  if (selection === 'all') {
    return [...PROJECT_IDS];
  }
  return isProjectId(selection) ? [selection] : [];
}

function parseLimit(value: unknown): number | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.min(Math.max(Math.floor(parsed), 1), 200);
}

function filterSeeds(params: {
  seeds: readonly DiscoveredProjectAuditFindingSeed[];
  projectSelection: DiscoveryProjectSelection;
  includeRejected: boolean;
}): DiscoveredProjectAuditFindingSeed[] {
  const projectIds = new Set(resolveProjectIds(params.projectSelection));
  return params.seeds.filter((seed) => (
    projectIds.has(seed.projectId)
    && (params.includeRejected || seed.discovery.status !== 'rejected')
  ));
}

function summarizeSeeds(seeds: readonly DiscoveredProjectAuditFindingSeed[]) {
  const summary = {
    total: seeds.length,
    candidate: 0,
    approved: 0,
    rejected: 0,
    byProject: Object.fromEntries(PROJECT_IDS.map((projectId) => [projectId, 0])) as Record<ProjectId, number>,
  };

  for (const seed of seeds) {
    summary[seed.discovery.status] += 1;
    summary.byProject[seed.projectId] += 1;
  }

  return summary;
}

function buildListResponse(params: {
  seeds: readonly DiscoveredProjectAuditFindingSeed[];
  projectSelection: DiscoveryProjectSelection;
  includeRejected: boolean;
  scanned?: number;
}) {
  const visibleSeeds = filterSeeds({
    seeds: params.seeds,
    projectSelection: params.projectSelection,
    includeRejected: params.includeRejected,
  });

  return NextResponse.json({
    success: true,
    projectSelection: params.projectSelection,
    detectorIds: listRuleDetectorIds(),
    scanned: params.scanned ?? 0,
    counts: summarizeSeeds(visibleSeeds),
    seeds: visibleSeeds,
  });
}

export async function GET(request: NextRequest) {
  try {
    if (!isDiscoveryRequestAllowed({
      requestUrl: request.url,
      hostHeader: request.headers.get('host'),
      enabledEnv: process.env.PROJECT_AUDIT_DISCOVERY_ENABLED,
    })) {
      return NextResponse.json({ error: '源码候选发现接口未启用' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsedProject = parseDiscoveryProjectSelection(searchParams.get('projectId'));
    if (!parsedProject.success) {
      return NextResponse.json({ error: parsedProject.error }, { status: 400 });
    }
    const projectSelection = parsedProject.projectSelection;
    const includeRejected = searchParams.get('includeRejected') === 'true';
    const seeds = loadDiscoveredSeeds();

    return buildListResponse({
      seeds,
      projectSelection,
      includeRejected,
    });
  } catch (error) {
    console.error('[project-audit discovery GET]', error);
    return NextResponse.json({ error: '源码候选读取失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isDiscoveryRequestAllowed({
      requestUrl: request.url,
      hostHeader: request.headers.get('host'),
      enabledEnv: process.env.PROJECT_AUDIT_DISCOVERY_ENABLED,
    })) {
      return NextResponse.json({ error: '源码候选发现接口未启用' }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || '');
    const parsedProject = parseDiscoveryProjectSelection(body.projectId);
    if (!parsedProject.success) {
      return NextResponse.json({ error: parsedProject.error }, { status: 400 });
    }
    const projectSelection = parsedProject.projectSelection;
    const includeRejected = body.includeRejected === true;

    switch (action) {
      case 'scan': {
        const limitPerProject = parseLimit(body.limitPerProject);
        const projectIds = resolveProjectIds(projectSelection);
        return withDiscoveredSeedStoreLock(() => {
          const existingSeeds = loadDiscoveredSeeds();
          const scannedSeeds = projectIds.flatMap((projectId) => (
            discoverProjectFindingCandidates(projectId, { limit: limitPerProject })
          ));
          const seeds = mergeDiscoveredSeedCandidates(existingSeeds, scannedSeeds);
          saveDiscoveredSeeds(seeds);

          return buildListResponse({
            seeds,
            projectSelection,
            includeRejected,
            scanned: scannedSeeds.length,
          });
        });
      }

      case 'updateStatus': {
        const seedId = typeof body.seedId === 'string' ? body.seedId : '';
        const status = isDiscoveryStatus(body.status) ? body.status : null;
        if (!seedId || !status) {
          return NextResponse.json({ error: '缺少 seedId 或 status' }, { status: 400 });
        }

        return withDiscoveredSeedStoreLock(() => {
          const currentSeeds = loadDiscoveredSeeds();
          const result = updateDiscoveredSeedStatus(currentSeeds, seedId, status);
          if (!result.updated) {
            return NextResponse.json({ error: '未找到候选 seed' }, { status: 404 });
          }
          saveDiscoveredSeeds(result.seeds);

          return buildListResponse({
            seeds: result.seeds,
            projectSelection,
            includeRejected,
          });
        });
      }

      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }
  } catch (error) {
    console.error('[project-audit discovery POST]', error);
    return NextResponse.json({ error: '源码候选操作失败' }, { status: 500 });
  }
}
