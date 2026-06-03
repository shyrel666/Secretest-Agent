import type { CSSProperties, ElementType } from 'react';

export interface ThemedCodeBlockProps {
  code: string;
  language?: string;
  customStyle?: CSSProperties;
  codeTagStyle?: CSSProperties;
  preTag?: ElementType;
  showLineNumbers?: boolean;
}
