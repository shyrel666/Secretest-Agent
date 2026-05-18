'use client';

import type { CSSProperties, ElementType } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';

interface ThemedCodeBlockProps {
  code: string;
  language?: string;
  customStyle?: CSSProperties;
  codeTagStyle?: CSSProperties;
  preTag?: ElementType;
  showLineNumbers?: boolean;
}

export function ThemedCodeBlock({
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
