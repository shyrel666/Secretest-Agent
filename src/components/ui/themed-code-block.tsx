'use client';

import dynamic from 'next/dynamic';
import type { ThemedCodeBlockProps } from './themed-code-block.types';

export const ThemedCodeBlock = dynamic<ThemedCodeBlockProps>(
  () =>
    import('./themed-code-block-impl').then((m) => ({
      default: m.ThemedCodeBlockImpl,
    })),
  {
    loading: () => (
      <div
        style={{
          margin: 0,
          borderRadius: '0.5rem',
          padding: '0.875rem',
          fontSize: '0.75rem',
          lineHeight: '1.6',
          overflowX: 'auto',
          background: 'var(--muted)',
        }}
      >
        <code>...</code>
      </div>
    ),
  },
);
