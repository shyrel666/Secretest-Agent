'use client';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';
import type { ThemedCodeBlockProps } from './themed-code-block.types';

export function ThemedCodeBlockImpl({
  code,
  language = 'text',
  customStyle,
  codeTagStyle,
  preTag = 'div',
  showLineNumbers = false,
}: ThemedCodeBlockProps) {
  const { resolvedTheme } = useTheme();
  const style = resolvedTheme === 'light' ? oneLight : oneDark;

  return (
    <SyntaxHighlighter
      language={language}
      style={style}
      PreTag={preTag}
      customStyle={customStyle}
      codeTagProps={codeTagStyle ? { style: codeTagStyle } : undefined}
      showLineNumbers={showLineNumbers}
    >
      {code}
    </SyntaxHighlighter>
  );
}
