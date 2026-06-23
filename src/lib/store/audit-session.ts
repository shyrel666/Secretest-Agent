'use client';

import { create } from 'zustand';
import type { AuditStage } from '@/components/audit/audit-utils';

export const AUDIT_DEFAULT_FILE_NAME = 'untitled.src';

interface AuditSessionState {
  input: string;
  isLoading: boolean;
  copiedId: string | null;
  stages: AuditStage[];
  reportContent: string;
  auditStartedAt: number | null;
  auditFinishedAt: number | null;
  activeFileName: string;
}

interface AuditSessionActions {
  setInput: (input: string) => void;
  setCopiedId: (copiedId: string | null) => void;
  setActiveFileName: (activeFileName: string) => void;
  startAudit: (startedAt?: number) => void;
  recordStage: (stageId: string, label: string) => void;
  completeActiveStages: () => void;
  appendReportContent: (content: string) => void;
  setReportContent: (content: string) => void;
  finishAudit: (finishedAt?: number) => void;
  reset: () => void;
}

export type AuditSessionStore = AuditSessionState & AuditSessionActions;

export const initialAuditSessionState: AuditSessionState = {
  input: '',
  isLoading: false,
  copiedId: null,
  stages: [],
  reportContent: '',
  auditStartedAt: null,
  auditFinishedAt: null,
  activeFileName: AUDIT_DEFAULT_FILE_NAME,
};

export function nextAuditStages(
  stages: AuditStage[],
  stageId: string,
  label: string,
  loggedAt?: number,
): AuditStage[] {
  const updated = stages.map((stage) =>
    stage.status === 'active' ? { ...stage, status: 'done' as const } : stage,
  );
  const isDone = stageId === 'done' || stageId.endsWith('_done');
  const existingIndex = updated.findIndex((stage) => stage.id === stageId);

  if (existingIndex !== -1) {
    updated[existingIndex] = {
      ...updated[existingIndex],
      label,
      status: isDone ? 'done' : 'active',
    };
    return updated;
  }

  return [
    ...updated,
    {
      id: stageId,
      label,
      status: isDone ? 'done' : 'active',
      ...(loggedAt == null ? {} : { loggedAt }),
    },
  ];
}

export function completeActiveAuditStages(stages: AuditStage[]): AuditStage[] {
  return stages.map((stage) => ({
    ...stage,
    status: stage.status === 'active' ? 'done' : stage.status,
  }));
}

export function getAuditElapsedMs(
  startedAt: number | null,
  finishedAt: number | null,
  now = Date.now(),
): number {
  if (startedAt == null) {
    return 0;
  }

  return Math.max(0, (finishedAt ?? now) - startedAt);
}

export const useAuditSessionStore = create<AuditSessionStore>((set) => ({
  ...initialAuditSessionState,

  setInput: (input) => set({ input }),
  setCopiedId: (copiedId) => set({ copiedId }),
  setActiveFileName: (activeFileName) => set({ activeFileName }),
  startAudit: (startedAt = Date.now()) =>
    set({
      isLoading: true,
      copiedId: null,
      stages: [],
      reportContent: '',
      auditStartedAt: startedAt,
      auditFinishedAt: null,
    }),
  recordStage: (stageId, label) =>
    set((state) => ({
      stages: nextAuditStages(state.stages, stageId, label, Date.now()),
    })),
  completeActiveStages: () =>
    set((state) => ({
      stages: completeActiveAuditStages(state.stages),
    })),
  appendReportContent: (content) =>
    set((state) => ({
      reportContent: state.reportContent + content,
    })),
  setReportContent: (reportContent) => set({ reportContent }),
  finishAudit: (finishedAt = Date.now()) =>
    set((state) => ({
      isLoading: false,
      auditFinishedAt: state.auditStartedAt == null ? null : (state.auditFinishedAt ?? finishedAt),
      stages: completeActiveAuditStages(state.stages),
    })),
  reset: () => set(initialAuditSessionState),
}));
