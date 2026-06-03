'use client';

import { Terminal } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type AgentWorkspaceLayout = 'centered' | 'viewport';

export interface AgentWorkspaceShellProps {
  sessionLabel: string;
  headerBadges?: ReactNode;
  sidebar: ReactNode;
  mainHeader?: { title: string; status: string };
  children: ReactNode;
  footer: ReactNode;
  footerHint?: string;
  /** centered：配置/生成页居中卡片；viewport：答题/结果页顶对齐 */
  layout?: AgentWorkspaceLayout;
  /** viewport 下 fill=铺满导航下区域；compact=略矮卡片，上下留白更多 */
  viewportHeight?: 'fill' | 'compact';
  sidebarSize?: 'default' | 'narrow';
}

export function AgentWorkspaceShell({
  sessionLabel,
  headerBadges,
  sidebar,
  mainHeader,
  children,
  footer,
  footerHint,
  layout = 'centered',
  viewportHeight = 'fill',
  sidebarSize = 'default',
}: AgentWorkspaceShellProps) {
  const isViewport = layout === 'viewport';
  const isCompactViewport = isViewport && viewportHeight === 'compact';

  return (
    <div
      className={
        isCompactViewport
          ? 'agent-workspace flex h-[calc(100dvh-4rem)] flex-col px-4 py-1.5 sm:px-6 sm:py-2 lg:px-8'
          : isViewport
            ? 'agent-workspace flex h-[calc(100dvh-4rem)] flex-col px-4 py-1.5 sm:px-6 sm:py-2 lg:px-8'
            : 'agent-workspace flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-8'
      }
    >
      <div
        className={
          isViewport
            ? 'mx-auto flex h-full min-h-0 w-full max-w-[min(92rem,calc(100vw-1.5rem))] flex-col'
            : 'mx-auto flex w-full max-w-[min(76rem,calc(100vw-2rem))] flex-col'
        }
      >
        <div
          className={
            isCompactViewport
              ? 'agent-workspace-panel flex h-[min(720px,calc(100dvh-4.85rem))] max-h-[calc(100dvh-4.85rem)] min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card/90 shadow-2xl shadow-black/20 sm:rounded-2xl'
              : isViewport
                ? 'agent-workspace-panel flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card/90 shadow-2xl shadow-black/20 sm:rounded-2xl'
                : 'agent-workspace-panel flex h-[min(720px,calc(100dvh-11rem))] max-h-[calc(100dvh-11rem)] flex-col overflow-hidden rounded-xl border border-border/80 bg-card/90 shadow-2xl shadow-black/20 sm:rounded-2xl'
          }
        >
          <header
            className={
              isViewport
                ? 'flex flex-wrap items-center gap-2.5 border-b border-border/70 bg-muted/25 px-4 py-2.5 sm:px-6 sm:py-3'
                : 'flex flex-wrap items-center gap-3 border-b border-border/70 bg-muted/25 px-5 py-4 sm:px-6 lg:px-8'
            }
          >
            <div className="flex items-center gap-2" aria-hidden="true">
              <span className="h-3.5 w-3.5 rounded-full bg-rose-500/80 sm:h-4 sm:w-4" />
              <span className="h-3.5 w-3.5 rounded-full bg-amber-400/80 sm:h-4 sm:w-4" />
              <span className="h-3.5 w-3.5 rounded-full bg-emerald-500/80 sm:h-4 sm:w-4" />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2.5 font-mono text-sm text-muted-foreground sm:text-base">
              <Terminal className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
              <span className="truncate">
                secretest-agent — <span className="text-foreground/90">{sessionLabel}</span>
              </span>
            </div>
            {headerBadges ? (
              <div className="flex flex-wrap items-center gap-2.5 font-mono text-sm sm:text-base">
                {headerBadges}
              </div>
            ) : null}
          </header>

          <div
            className={
              sidebarSize === 'narrow'
                ? 'grid min-h-0 flex-1 lg:grid-cols-[minmax(13.5rem,15.5rem)_minmax(0,1fr)]'
                : 'grid min-h-0 flex-1 lg:grid-cols-[minmax(260px,20rem)_1fr]'
            }
          >
            <aside
              className={
                sidebarSize === 'narrow'
                  ? 'border-b border-border/60 bg-muted/15 p-4 lg:border-b-0 lg:border-r lg:overflow-y-auto lg:px-5 lg:py-4'
                  : 'border-b border-border/60 bg-muted/15 p-5 sm:p-6 lg:border-b-0 lg:border-r lg:p-7'
              }
            >
              {sidebar}
            </aside>

            <section className="flex min-h-0 flex-1 flex-col bg-background/30">
              {mainHeader ? (
                <div
                  className={
                    isViewport
                      ? 'flex items-center justify-between border-b border-border/50 px-4 py-2 sm:px-6 sm:py-2.5'
                      : 'flex items-center justify-between border-b border-border/50 px-5 py-3 sm:px-7 sm:py-3.5'
                  }
                >
                  <span className="font-mono text-sm font-medium text-foreground sm:text-base">
                    {mainHeader.title}
                  </span>
                  <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground sm:text-sm">
                    {mainHeader.status}
                  </span>
                </div>
              ) : null}
              {children}
            </section>
          </div>

          <footer
            className={
              isViewport
                ? 'flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/70 bg-muted/20 px-4 py-2.5 font-mono text-xs sm:px-6 sm:text-sm'
                : 'flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 bg-muted/20 px-5 py-3 font-mono text-xs sm:px-7 sm:py-3.5 sm:text-sm'
            }
          >
            {footer}
          </footer>
        </div>

        {footerHint ? (
          <p className="mt-3 shrink-0 text-center font-mono text-xs text-muted-foreground/70 sm:text-sm">
            {footerHint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
