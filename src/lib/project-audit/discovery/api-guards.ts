import {
  isSourceProjectSelection,
  type SourceProjectSelection,
} from '../types';

export type DiscoveryProjectSelectionResult = {
  success: true;
  projectSelection: SourceProjectSelection;
} | {
  success: false;
  error: string;
};

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function normalizeHost(value: string | null | undefined): string {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) {
    return '';
  }
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return end >= 0 ? raw.slice(0, end + 1) : raw;
  }
  return raw.split(':')[0];
}

export function parseDiscoveryProjectSelection(value: unknown): DiscoveryProjectSelectionResult {
  if (value == null || value === '') {
    return { success: true, projectSelection: 'all' };
  }
  if (typeof value === 'string' && isSourceProjectSelection(value)) {
    return { success: true, projectSelection: value };
  }
  return {
    success: false,
    error: `未知 projectId: ${String(value)}`,
  };
}

export function isDiscoveryRequestAllowed(input: {
  requestUrl: string;
  hostHeader?: string | null;
  enabledEnv?: string;
}): boolean {
  if (input.enabledEnv === 'true') {
    return true;
  }

  let urlHost = '';
  try {
    urlHost = normalizeHost(new URL(input.requestUrl).hostname);
  } catch {
    urlHost = '';
  }
  const headerHost = normalizeHost(input.hostHeader);

  return LOCAL_HOSTNAMES.has(urlHost) || LOCAL_HOSTNAMES.has(headerHost);
}
