'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  FileCode2,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type DiscoveryStatus = 'candidate' | 'approved' | 'rejected';
type SourceProjectSelection = 'all' | 'YM_PT' | 'itstec-24';

interface DiscoverySourceRef {
  path: string;
  startLine: number;
  endLine: number;
  role: string;
  symbol?: string;
}

interface DiscoverySeedView {
  id: string;
  projectId: 'YM_PT' | 'itstec-24';
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  standardReference: string;
  vulnerabilityType: string;
  sourceRefs: DiscoverySourceRef[];
  evidenceFlow: Array<{
    label: string;
    summary: string;
  }>;
  discovery: {
    status: DiscoveryStatus;
    detectorId: string;
    confidence: number;
    reason: string;
  };
}

interface DiscoveryCounts {
  total: number;
  candidate: number;
  approved: number;
  rejected: number;
  byProject: Record<'YM_PT' | 'itstec-24', number>;
}

interface DiscoveryResponse {
  success?: boolean;
  error?: string;
  scanned?: number;
  counts?: DiscoveryCounts;
  seeds?: DiscoverySeedView[];
}

interface ProjectSeedDiscoveryPanelProps {
  active: boolean;
  sourceProject: SourceProjectSelection;
  onSourceProjectChange: (project: SourceProjectSelection) => void;
}

const PROJECT_OPTIONS: Array<{ value: SourceProjectSelection; label: string; desc: string }> = [
  { value: 'all', label: '全部', desc: '跨项目' },
  { value: 'YM_PT', label: 'YM_PT', desc: '体检系统' },
  { value: 'itstec-24', label: 'itstec-24', desc: '支付系统' },
];

const STATUS_META: Record<DiscoveryStatus, { label: string; className: string }> = {
  candidate: {
    label: 'candidate',
    className: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
  },
  approved: {
    label: 'approved',
    className: 'border-primary/30 bg-primary/15 text-primary',
  },
  rejected: {
    label: 'rejected',
    className: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
  },
};

function statusSortValue(status: DiscoveryStatus): number {
  if (status === 'candidate') return 0;
  if (status === 'approved') return 1;
  return 2;
}

function getPrimaryRef(seed: DiscoverySeedView): DiscoverySourceRef | null {
  return seed.sourceRefs[0] || null;
}

async function parseDiscoveryResponse(response: Response): Promise<DiscoveryResponse> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : '源码候选请求失败');
  }
  return data;
}

export function ProjectSeedDiscoveryPanel({
  active,
  sourceProject,
  onSourceProjectChange,
}: ProjectSeedDiscoveryPanelProps) {
  const [seeds, setSeeds] = useState<DiscoverySeedView[]>([]);
  const [counts, setCounts] = useState<DiscoveryCounts | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [updatingSeedId, setUpdatingSeedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const requestSeqRef = useRef(0);

  const sortedSeeds = useMemo(() => (
    [...seeds].sort((left, right) => {
      const statusDelta = statusSortValue(left.discovery.status) - statusSortValue(right.discovery.status);
      if (statusDelta !== 0) return statusDelta;
      if (right.discovery.confidence !== left.discovery.confidence) {
        return right.discovery.confidence - left.discovery.confidence;
      }
      return left.title.localeCompare(right.title, 'zh-CN');
    })
  ), [seeds]);

  const applyResponse = useCallback((data: DiscoveryResponse) => {
    if (Array.isArray(data.seeds)) {
      setSeeds(data.seeds);
    }
    if (data.counts) {
      setCounts(data.counts);
    }
  }, []);

  const loadSeeds = useCallback(async () => {
    if (!active) {
      return;
    }
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    const isCurrentRequest = () => requestSeqRef.current === requestSeq;
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/project-audit/discovery?projectId=${encodeURIComponent(sourceProject)}&includeRejected=true`,
        { cache: 'no-store' },
      );
      const data = await parseDiscoveryResponse(response);
      if (isCurrentRequest()) {
        applyResponse(data);
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '源码候选读取失败';
      if (isCurrentRequest()) {
        setError(message);
      }
    } finally {
      if (isCurrentRequest()) {
        setIsLoading(false);
      }
    }
  }, [active, applyResponse, sourceProject]);

  useEffect(() => {
    void loadSeeds();
  }, [loadSeeds]);

  const scanSeeds = useCallback(async () => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    const isCurrentRequest = () => requestSeqRef.current === requestSeq;
    setIsScanning(true);
    setError('');
    try {
      const response = await fetch('/api/project-audit/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'scan',
          projectId: sourceProject,
          includeRejected: true,
        }),
      });
      const data = await parseDiscoveryResponse(response);
      if (isCurrentRequest()) {
        applyResponse(data);
        toast.success('源码候选已刷新', {
          description: `本次扫描 ${data.scanned || 0} 个候选点`,
        });
      }
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : '源码扫描失败';
      if (isCurrentRequest()) {
        setError(message);
        toast.error('源码扫描失败', { description: message });
      }
    } finally {
      if (isCurrentRequest()) {
        setIsScanning(false);
      }
    }
  }, [applyResponse, sourceProject]);

  const updateStatus = useCallback(async (seedId: string, status: DiscoveryStatus) => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    const isCurrentRequest = () => requestSeqRef.current === requestSeq;
    setUpdatingSeedId(seedId);
    setError('');
    try {
      const response = await fetch('/api/project-audit/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateStatus',
          projectId: sourceProject,
          includeRejected: true,
          seedId,
          status,
        }),
      });
      const data = await parseDiscoveryResponse(response);
      if (isCurrentRequest()) {
        applyResponse(data);
      }
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : '候选状态更新失败';
      if (isCurrentRequest()) {
        setError(message);
        toast.error('候选状态更新失败', { description: message });
      }
    } finally {
      if (isCurrentRequest()) {
        setUpdatingSeedId(null);
      } else {
        setUpdatingSeedId((currentSeedId) => (currentSeedId === seedId ? null : currentSeedId));
      }
    }
  }, [applyResponse, sourceProject]);

  if (!active) {
    return null;
  }

  return (
    <div className="rounded-xl border border-primary/25 bg-[#031f22]/45 p-3 sm:p-4">
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-wider text-primary">source.seedDiscovery</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>{counts?.candidate ?? 0} candidate</span>
            <span className="text-border">|</span>
            <span>{counts?.approved ?? 0} approved</span>
            <span className="text-border">|</span>
            <span>{counts?.rejected ?? 0} rejected</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/60 bg-background/40 p-1">
            {PROJECT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onSourceProjectChange(option.value)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-left transition-colors',
                  sourceProject === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                <span className="block font-mono text-xs font-semibold">{option.label}</span>
                <span className="block text-[10px] leading-none opacity-80">{option.desc}</span>
              </button>
            ))}
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={loadSeeds}
            disabled={isLoading || isScanning}
            title="刷新候选列表"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            刷新
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={scanSeeds}
            disabled={isScanning}
            title="扫描源码候选"
          >
            <ScanSearch className={cn('h-4 w-4', isScanning && 'animate-pulse')} />
            扫描
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-200">
          {error}
        </div>
      ) : null}

      <ScrollArea className="h-56 rounded-lg border border-border/50 bg-background/35">
        {sortedSeeds.length === 0 ? (
          <div className="flex h-56 items-center justify-center px-4 text-center font-mono text-xs text-muted-foreground">
            {isLoading ? 'loading discovery seeds…' : 'no source seeds'}
          </div>
        ) : (
          <div className="space-y-2 p-2.5">
            {sortedSeeds.map((seed) => {
              const primaryRef = getPrimaryRef(seed);
              const statusMeta = STATUS_META[seed.discovery.status];
              const isUpdating = updatingSeedId === seed.id;

              return (
                <article
                  key={seed.id}
                  className="rounded-lg border border-border/60 bg-card/60 p-3 transition-colors hover:border-primary/35"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={statusMeta.className}>
                          {statusMeta.label}
                        </Badge>
                        <Badge variant="outline" className="border-border/60 bg-background/50 text-muted-foreground">
                          {seed.projectId}
                        </Badge>
                        <Badge variant="outline" className="border-border/60 bg-background/50 text-muted-foreground">
                          {seed.difficulty}
                        </Badge>
                        <Badge variant="outline" className="border-border/60 bg-background/50 text-muted-foreground">
                          {Math.round(seed.discovery.confidence * 100)}%
                        </Badge>
                      </div>
                      <p className="mt-2 break-words text-sm font-medium leading-snug text-foreground">
                        {seed.title}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                        <span>{seed.vulnerabilityType}</span>
                        <span>{seed.standardReference}</span>
                        <span>{seed.discovery.detectorId}</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {seed.discovery.status !== 'approved' ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => updateStatus(seed.id, 'approved')}
                          disabled={isUpdating}
                          title="批准候选"
                          className="h-8 px-2.5"
                        >
                          <Check className="h-4 w-4" />
                          批准
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus(seed.id, 'candidate')}
                          disabled={isUpdating}
                          title="撤回批准"
                          className="h-8 px-2.5"
                        >
                          <RotateCcw className="h-4 w-4" />
                          撤回
                        </Button>
                      )}
                      {seed.discovery.status !== 'rejected' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus(seed.id, 'rejected')}
                          disabled={isUpdating}
                          title="拒绝候选"
                          className="h-8 px-2.5 border-rose-400/25 text-rose-200 hover:bg-rose-500/10"
                        >
                          <X className="h-4 w-4" />
                          拒绝
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus(seed.id, 'candidate')}
                          disabled={isUpdating}
                          title="恢复候选"
                          className="h-8 px-2.5"
                        >
                          <RotateCcw className="h-4 w-4" />
                          恢复
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <div className="min-w-0 rounded-md border border-border/50 bg-background/45 px-2.5 py-2 font-mono">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="truncate">
                          {primaryRef
                            ? `${primaryRef.path}:${primaryRef.startLine}-${primaryRef.endLine}`
                            : 'source ref missing'}
                        </span>
                      </div>
                      {primaryRef?.symbol ? (
                        <p className="mt-1 truncate text-muted-foreground/75">{primaryRef.symbol}</p>
                      ) : null}
                    </div>
                    <div className="min-w-0 rounded-md border border-border/50 bg-background/45 px-2.5 py-2 leading-relaxed">
                      {seed.evidenceFlow[0]?.summary || seed.discovery.reason}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
