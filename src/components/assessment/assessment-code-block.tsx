'use client';

import { ThemedCodeBlock } from '@/components/ui/themed-code-block';
import type { AssessmentQuestion } from '@/lib/store/assessment';

const LANG_MAP: Record<AssessmentQuestion['language'], string> = {
  Java: 'java',
  C: 'c',
  'C++': 'cpp',
  'C#': 'csharp',
};

export type AssessmentCodeSize = 'default' | 'compact' | 'comfortable' | 'quiz';

const CODE_SIZE_STYLE: Record<
  AssessmentCodeSize,
  { fontSize: string; lineHeight: string; showLineNumbers: boolean }
> = {
  default: { fontSize: '0.85rem', lineHeight: '1.55', showLineNumbers: true },
  quiz: { fontSize: '0.9375rem', lineHeight: '1.62', showLineNumbers: true },
  comfortable: { fontSize: '0.8125rem', lineHeight: '1.55', showLineNumbers: true },
  compact: { fontSize: '0.75rem', lineHeight: '1.5', showLineNumbers: false },
};

export function AssessmentCodeBlock({
  code,
  language,
  size = 'default',
  /** @deprecated 使用 size="compact" */
  compact = false,
}: {
  code: string;
  language: AssessmentQuestion['language'];
  size?: AssessmentCodeSize;
  compact?: boolean;
}) {
  if (!code.trim()) return null;

  const resolvedSize = compact ? 'compact' : size;
  const style = CODE_SIZE_STYLE[resolvedSize];

  return (
    <ThemedCodeBlock
      language={LANG_MAP[language] ?? 'text'}
      customStyle={{
        borderRadius: '0.5rem',
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        margin: 0,
      }}
      showLineNumbers={style.showLineNumbers}
      code={code}
    />
  );
}
