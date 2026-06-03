'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemedCodeBlock } from '@/components/ui/themed-code-block';

export function AuditMarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none [&_h1]:mb-5 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-4 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:text-base [&_h4]:font-semibold">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p(props) { return <p className="my-3 leading-8 text-[15px] text-foreground/95" {...props} />; },
          ul(props) { return <ul className="my-4 list-disc space-y-2 pl-6" {...props} />; },
          ol(props) { return <ol className="my-4 list-decimal space-y-2 pl-6" {...props} />; },
          li(props) { return <li className="leading-8" {...props} />; },
          blockquote(props) { return <blockquote className="my-5 rounded-r-md border-l-4 border-primary/50 bg-muted/30 px-4 py-3 text-foreground/90" {...props} />; },
          hr(props) { return <hr className="my-6 border-border/60" {...props} />; },
          table(props) {
            return (
              <div className="my-6 overflow-x-auto rounded-lg border border-border/60 bg-muted/10">
                <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-x-4 border-spacing-y-3 text-left" {...props} />
              </div>
            );
          },
          thead(props) { return <thead className="bg-muted/30" {...props} />; },
          th(props) { return <th className="px-4 py-3 text-sm font-semibold text-foreground whitespace-normal" {...props} />; },
          td(props) { return <td className="px-4 py-3 align-top leading-8 text-foreground/90 whitespace-normal break-words" {...props} />; },
          code({ children, className }: React.ComponentProps<'code'> & { className?: string }) {
            const content = String(children).replace(/\n$/, '');
            const langMatch = /language-([\w-]+)/.exec(className || '');
            const isInline = !className && !content.includes('\n');
            if (isInline) return <code className="rounded bg-background/50 px-1.5 py-0.5 text-xs text-primary">{children}</code>;
            return (
              <ThemedCodeBlock
                language={langMatch?.[1] || 'text'}
                preTag="div"
                customStyle={{ margin: 0, borderRadius: '0.5rem', padding: '0.875rem', fontSize: '0.75rem', lineHeight: '1.6', overflowX: 'auto' }}
                codeTagStyle={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                code={content}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
