import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { normalizeMarkdownText } from '../markdown';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MarkdownTextProps {
  text: unknown;
  inlineParagraphs?: boolean;
  textClassName?: string;
}

export default function MarkdownText({
  text,
  inlineParagraphs = false,
  textClassName,
}: MarkdownTextProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) =>
          inlineParagraphs ? (
            <span className={textClassName}>{children}</span>
          ) : (
            <p className={textClassName}>{children}</p>
          ),
        ul: ({ children }) => (
          <ul className="list-disc space-y-1 pl-5 text-slate-600">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal space-y-1 pl-5 text-slate-600">{children}</ol>
        ),
        li: ({ children }) => <li className={textClassName}>{children}</li>,
        code: ({ children, className, ...props }) => (
          <code
            className={cn(
              'rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[0.95em] text-indigo-700',
              className,
            )}
            {...props}
          >
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="overflow-x-auto rounded-xl bg-slate-900 px-3 py-2 text-sm text-slate-100">
            {children}
          </pre>
        ),
      }}
    >
      {normalizeMarkdownText(text)}
    </ReactMarkdown>
  );
}
