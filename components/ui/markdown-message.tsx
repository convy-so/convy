import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { extractAIGeneratedResponse } from '@/lib/ai-utils';

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

/**
 * Pre-processes text to ensure better formatting for markdown rendering.
 */
const formatMarkdown = (text: unknown) => {
  if (!text || typeof text !== 'string') return "";

  // 1. Extract natural language from AI-generated JSON blocks
  // This handles reasoning/response structure and streaming partials.
  let formatted = extractAIGeneratedResponse(text);

  // 2. Strip legacy scratchpad blocks (AI thinking) if any remain
  formatted = formatted.replace(/<scratchpad>[\s\S]*?<\/scratchpad>/g, "").trim();

  // 2. Ensure space after punctuation (. ! ? , ; :) if followed by a letter.
  // Prevents "Hello.World" but allows "3.14" and "v1.0".
  formatted = formatted.replace(/([.!?,;:|])([A-Za-z])/g, "$1 $2");

  // 3. Detect alphabetical lists (a. or a)) and transform to numeric markers
  // so Remark parses them as <ol> lists.
  // We also force a newline before the marker if it's currently inline to ensure Remark sees it as a list item.

  // Regex explanation: 
  // Look for (A) or A. or a) markers. 
  // If they are at the start of a line or preceded by a space and punctuation.
  const lines = formatted.split('\n');
  const processedLines = lines.map(line => {
    // If it looks like an alphabetical list item "a. " or "a) " or "(a) "
    if (/^\s*(\(?[a-zA-Z][\.\)]|[a-zA-Z]\))\s+/.test(line)) {
      return line.replace(
        /^(\s*)(\(?[a-zA-Z][\.\)]|[a-zA-Z]\))(\s+)/,
        (_match, indent: string, _marker: string, spacing: string) =>
          `${indent}1.${spacing}`,
      );
    }

    // Check for inline markers that should be on a new line (e.g. "...Is this about: (A) relationship...")
    // Transform "...: (A) " to "...\n1. "
    if (/\s(\(?[a-zA-Z][\.\)]|[a-zA-Z]\))\s+/.test(line)) {
      return line.replace(/\s(\(?[a-zA-Z][\.\)]|[a-zA-Z]\))(\s+)/g, '\n1. $2');
    }

    return line;
  });

  return processedLines.join('\n');
};

/**
 * Component for rendering markdown-formatted messages
 * Supports bold, italic, lists, links, code blocks, etc.
 */
export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  const formattedContent = formatMarkdown(content);

  // Check if content contains alphabetical list markers to apply specific styling
  const hasAlphaList = /^\s*[a-zA-Z][\.\)]\s+/m.test(content);

  return (
    <div className={cn('text-sm', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: (props) => (
            <h1 className="text-lg font-bold mt-4 mb-2" {...props} />
          ),
          h2: (props) => (
            <h2 className="text-base font-bold mt-3 mb-2" {...props} />
          ),
          h3: (props) => (
            <h3 className="text-sm font-bold mt-2 mb-1" {...props} />
          ),

          // Paragraphs - Preserve sentence spacing with whitespace-pre-wrap
          p: (props) => (
            <p className="mb-2 last:mb-0 leading-relaxed whitespace-pre-wrap" {...props} />
          ),

          // Lists
          ul: (props) => (
            <ul className="list-disc list-inside mb-2 space-y-1" {...props} />
          ),
          ol: (props) => (
            <ol
              className={cn(
                "list-inside mb-2 space-y-1",
                hasAlphaList ? "list-[lower-alpha]" : "list-decimal"
              )}
              {...props}
            />
          ),
          li: (props) => (
            <li className="leading-relaxed" {...props} />
          ),

          // ... rest of components ...
          strong: (props) => (
            <strong className="font-bold" {...props} />
          ),
          em: (props) => (
            <em className="italic" {...props} />
          ),
          code: ({ className, ...props }: ComponentPropsWithoutRef<"code">) => {
            const isInline = !className?.includes("language-");
            return isInline ? (
              <code
                className={cn(
                  "px-1.5 py-0.5 bg-gray-100 text-gray-800 rounded text-xs font-mono",
                  className,
                )}
                {...props}
              />
            ) : (
              <code
                className={cn(
                  "block px-3 py-2 bg-gray-100 text-gray-800 rounded text-xs font-mono overflow-x-auto mb-2",
                  className,
                )}
                {...props}
              />
            );
          },
          a: (props) => (
            <a
              className="text-blue-600 hover:text-blue-800 underline"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          blockquote: (props) => (
            <blockquote
              className="border-l-4 border-gray-300 pl-4 py-1 my-2 italic text-gray-700"
              {...props}
            />
          ),
        }}
      >
        {formattedContent}
      </ReactMarkdown>
    </div>
  );
}
