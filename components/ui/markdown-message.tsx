import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

/**
 * Component for rendering markdown-formatted messages
 * Supports bold, italic, lists, links, code blocks, etc.
 */
export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  return (
    <div className={cn('text-sm', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        // Headings
        h1: ({ node, ...props }) => (
          <h1 className="text-lg font-bold mt-4 mb-2" {...props} />
        ),
        h2: ({ node, ...props }) => (
          <h2 className="text-base font-bold mt-3 mb-2" {...props} />
        ),
        h3: ({ node, ...props }) => (
          <h3 className="text-sm font-bold mt-2 mb-1" {...props} />
        ),
        
        // Paragraphs
        p: ({ node, ...props }) => (
          <p className="mb-2 last:mb-0 leading-relaxed" {...props} />
        ),
        
        // Lists
        ul: ({ node, ...props }) => (
          <ul className="list-disc list-inside mb-2 space-y-1" {...props} />
        ),
        ol: ({ node, ...props }) => (
          <ol className="list-decimal list-inside mb-2 space-y-1" {...props} />
        ),
        li: ({ node, ...props }) => (
          <li className="leading-relaxed" {...props} />
        ),
        
        // Emphasis
        strong: ({ node, ...props }) => (
          <strong className="font-bold" {...props} />
        ),
        em: ({ node, ...props }) => (
          <em className="italic" {...props} />
        ),
        
        // Code
        code: ({ node, inline, ...props }: any) => 
          inline ? (
            <code
              className="px-1.5 py-0.5 bg-gray-100 text-gray-800 rounded text-xs font-mono"
              {...props}
            />
          ) : (
            <code
              className="block px-3 py-2 bg-gray-100 text-gray-800 rounded text-xs font-mono overflow-x-auto mb-2"
              {...props}
            />
          ),
        
        // Links
        a: ({ node, ...props }) => (
          <a
            className="text-blue-600 hover:text-blue-800 underline"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          />
        ),
        
        // Blockquotes
        blockquote: ({ node, ...props }) => (
          <blockquote
            className="border-l-4 border-gray-300 pl-4 py-1 my-2 italic text-gray-700"
            {...props}
          />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
