import { Children, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import "katex/contrib/mhchem";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { extractAIGeneratedResponse } from "@/shared/ai/response-extraction";
import { cn } from "@/shared/ui/tailwind-class-utils";
import { requireValue } from "@/shared/utils/collections";

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

const SUPERSCRIPT_CHAR_MAP: Record<string, string> = {
  "\u2070": "0",
  "\u00B9": "1",
  "\u00B2": "2",
  "\u00B3": "3",
  "\u2074": "4",
  "\u2075": "5",
  "\u2076": "6",
  "\u2077": "7",
  "\u2078": "8",
  "\u2079": "9",
  "\u207A": "+",
  "\u207B": "-",
  "\u207C": "=",
  "\u207D": "(",
  "\u207E": ")",
  "\u207F": "n",
  "\u1D43": "a",
  "\u1D47": "b",
  "\u1D9C": "c",
  "\u1D48": "d",
  "\u1D49": "e",
  "\u1DA0": "f",
  "\u1D4D": "g",
  "\u02B0": "h",
  "\u2071": "i",
  "\u02B2": "j",
  "\u1D4F": "k",
  "\u02E1": "l",
  "\u1D50": "m",
  "\u1D52": "o",
  "\u1D56": "p",
  "\u02B3": "r",
  "\u02E2": "s",
  "\u1D57": "t",
  "\u1D58": "u",
  "\u1D5B": "v",
  "\u02B7": "w",
  "\u02E3": "x",
  "\u02B8": "y",
  "\u1DBB": "z",
  "\u1D2C": "A",
  "\u1D2E": "B",
  "\u1D30": "D",
  "\u1D31": "E",
  "\u1D33": "G",
  "\u1D34": "H",
  "\u1D35": "I",
  "\u1D36": "J",
  "\u1D37": "K",
  "\u1D38": "L",
  "\u1D39": "M",
  "\u1D3A": "N",
  "\u1D3C": "O",
  "\u1D3E": "P",
  "\u1D3F": "R",
  "\u1D40": "T",
  "\u1D41": "U",
  "\u1D42": "W",
  "\u2C7D": "V",
};

const SUBSCRIPT_CHAR_MAP: Record<string, string> = {
  "\u2080": "0",
  "\u2081": "1",
  "\u2082": "2",
  "\u2083": "3",
  "\u2084": "4",
  "\u2085": "5",
  "\u2086": "6",
  "\u2087": "7",
  "\u2088": "8",
  "\u2089": "9",
  "\u208A": "+",
  "\u208B": "-",
  "\u208C": "=",
  "\u208D": "(",
  "\u208E": ")",
  "\u2090": "a",
  "\u2091": "e",
  "\u2095": "h",
  "\u1D62": "i",
  "\u2C7C": "j",
  "\u2096": "k",
  "\u2097": "l",
  "\u2098": "m",
  "\u2099": "n",
  "\u2092": "o",
  "\u209A": "p",
  "\u1D63": "r",
  "\u209B": "s",
  "\u209C": "t",
  "\u2093": "x",
};

const SUPERSCRIPT_CHARS = "\u2070\u00B9\u00B2\u00B3\u2074\u2075\u2076\u2077\u2078\u2079\u207A\u207B\u207C\u207D\u207E\u207F\u1D43\u1D47\u1D9C\u1D48\u1D49\u1DA0\u1D4D\u02B0\u2071\u02B2\u1D4F\u02E1\u1D50\u1D52\u1D56\u02B3\u02E2\u1D57\u1D58\u1D5B\u02B7\u02E3\u02B8\u1DBB\u1D2C\u1D2E\u1D30\u1D31\u1D33\u1D34\u1D35\u1D36\u1D37\u1D38\u1D39\u1D3A\u1D3C\u1D3E\u1D3F\u1D40\u1D41\u1D42\u2C7D";
const SUBSCRIPT_CHARS = "\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089\u208A\u208B\u208C\u208D\u208E\u2090\u2091\u2095\u1D62\u2C7C\u2096\u2097\u2098\u2099\u2092\u209A\u1D63\u209B\u209C\u2093";

const KATEX_MACROS = {
  "\\RR": "\\mathbb{R}",
  "\\NN": "\\mathbb{N}",
  "\\ZZ": "\\mathbb{Z}",
  "\\QQ": "\\mathbb{Q}",
  "\\CC": "\\mathbb{C}",
  "\\re": "\\operatorname{Re}",
  "\\im": "\\operatorname{Im}",
  "\\angstrom": "\\text{\\AA}",
};

function mapUnicodeMathSequence(sequence: string, charMap: Record<string, string>) {
  return Array.from(sequence, (character) => charMap[character] ?? character).join("");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function transformMathLikeUnicode(text: string) {
  const superscriptPattern = new RegExp(
    `(^|[^\\w])([${escapeRegExp(SUPERSCRIPT_CHARS)}]+)(?=[^${escapeRegExp(SUPERSCRIPT_CHARS)}]|$)`,
    "g",
  );
  const subscriptPattern = new RegExp(
    `(^|[^\\w])([${escapeRegExp(SUBSCRIPT_CHARS)}]+)(?=[^${escapeRegExp(SUBSCRIPT_CHARS)}]|$)`,
    "g",
  );

  return text
    .replace(
      /([A-Za-z0-9)\]}])([\u2070\u00B9\u00B2\u00B3\u2074\u2075\u2076\u2077\u2078\u2079\u207A\u207B\u207C\u207D\u207E\u207F\u1D43\u1D47\u1D9C\u1D48\u1D49\u1DA0\u1D4D\u02B0\u2071\u02B2\u1D4F\u02E1\u1D50\u1D52\u1D56\u02B3\u02E2\u1D57\u1D58\u1D5B\u02B7\u02E3\u02B8\u1DBB\u1D2C\u1D2E\u1D30\u1D31\u1D33\u1D34\u1D35\u1D36\u1D37\u1D38\u1D39\u1D3A\u1D3C\u1D3E\u1D3F\u1D40\u1D41\u1D42\u2C7D]+)/g,
      (_match, base: string, sequence: string) => `${base}^{${mapUnicodeMathSequence(sequence, SUPERSCRIPT_CHAR_MAP)}}`,
    )
    .replace(superscriptPattern, (_match, prefix: string, sequence: string) => {
      return `${prefix}^{${mapUnicodeMathSequence(sequence, SUPERSCRIPT_CHAR_MAP)}}`;
    })
    .replace(
      /([A-Za-z0-9)\]}])([\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089\u208A\u208B\u208C\u208D\u208E\u2090\u2091\u2095\u1D62\u2C7C\u2096\u2097\u2098\u2099\u2092\u209A\u1D63\u209B\u209C\u2093]+)/g,
      (_match, base: string, sequence: string) => `${base}_{${mapUnicodeMathSequence(sequence, SUBSCRIPT_CHAR_MAP)}}`,
    )
    .replace(subscriptPattern, (_match, prefix: string, sequence: string) => {
      return `${prefix}_{${mapUnicodeMathSequence(sequence, SUBSCRIPT_CHAR_MAP)}}`;
    });
}

function transformPreservingInlineCode(text: string, transform: (segment: string) => string) {
  return text
    .split(/(`+[\s\S]*?\1)/g)
    .map((segment) => (segment.startsWith("`") ? segment : transform(segment)))
    .join("");
}

function transformPreservingFencedCodeBlocks(
  text: string,
  transform: (segment: string) => string,
) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const chunks: Array<{ kind: "text" | "code"; value: string }> = [];
  const buffer: string[] = [];
  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    chunks.push({
      kind: inFence ? "code" : "text",
      value: buffer.join("\n"),
    });
    buffer.length = 0;
  };

  for (const line of lines) {
    if (!inFence) {
      const openingFence = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
      if (openingFence) {
        flush();
        inFence = true;
        const fenceToken = requireValue(
          openingFence[2],
          "Expected fenced code delimiter token",
        );
        fenceChar = requireValue(
          fenceToken[0],
          "Expected fenced code delimiter character",
        );
        fenceLength = fenceToken.length;
        buffer.push(line);
        continue;
      }

      buffer.push(line);
      continue;
    }

    buffer.push(line);
    const closingFence = new RegExp(
      `^\\s*${escapeRegExp(fenceChar)}{${fenceLength},}\\s*$`,
    );
    if (closingFence.test(line)) {
      flush();
      inFence = false;
      fenceChar = "";
      fenceLength = 0;
    }
  }

  flush();

  return chunks
    .map((chunk) =>
      chunk.kind === "code" ? chunk.value : transformPreservingInlineCode(chunk.value, transform),
    )
    .join("\n");
}

function normalizeMarkdownMath(text: string) {
  return transformPreservingFencedCodeBlocks(text, (segment) => {
    const convertedDelimiters = segment
      .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression: string) => `$${expression.trim()}$`)
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression: string) => `$$${expression.trim()}$$`);

    return transformMathLikeUnicode(convertedDelimiters);
  });
}

function normalizeListMarkers(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/^[\t ]*[\u2022\u00B7\u25E6\u2023\u25AA\u25CF]\s+/gm, "- ")
    .replace(/(^[\t ]*)([a-zA-Z])[\.\)]\s+/gm, (_match, indent: string) => `${indent}1. `)
    .replace(/^[\t ]*\((?:[a-zA-Z]|\d+)\)\s+/gm, "1. ")
    .replace(/([^\n])\n([ \t]*[-*+]\s+)/g, "$1\n\n$2")
    .replace(/([^\n])\n([ \t]*\d+[\.\)]\s+)/g, "$1\n\n$2");
}

function formatMarkdown(text: unknown) {
  if (typeof text !== "string") return "";

  let formatted = extractAIGeneratedResponse(text);
  formatted = formatted.replace(/<scratchpad>[\s\S]*?<\/scratchpad>/g, "").trim();
  return normalizeListMarkers(normalizeMarkdownMath(formatted));
}

function renderCode({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"code">) {
  const isInline = !className?.includes("language-");
  const value = Children.toArray(children)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : "",
    )
    .join("")
    .replace(/\n$/, "");

  if (isInline) {
    return (
      <code
        className={cn(
          "rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[0.875em] text-slate-800",
          className,
        )}
        {...props}
      >
        {value}
      </code>
    );
  }

  return (
    <code
      className={cn(
        "block overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-sm leading-relaxed text-slate-100 shadow-sm",
        className,
      )}
      {...props}
    >
      {value}
    </code>
  );
}

function renderParagraph(props: ComponentPropsWithoutRef<"p">) {
  return <p className="mb-3 leading-7 text-slate-800 last:mb-0" {...props} />;
}

function renderList({
  ordered,
  className,
  ...props
}: ComponentPropsWithoutRef<"ol"> & ComponentPropsWithoutRef<"ul"> & { ordered?: boolean }) {
  const classes = cn(
    ordered ? "mb-3 list-decimal space-y-1 pl-6" : "mb-3 list-disc space-y-1 pl-6",
    "leading-7 text-slate-800 marker:text-slate-500",
    className,
  );

  return ordered ? (
    <ol className={classes} {...(props as ComponentPropsWithoutRef<"ol">)} />
  ) : (
    <ul className={classes} {...(props as ComponentPropsWithoutRef<"ul">)} />
  );
}

function renderPre({ children, className }: ComponentPropsWithoutRef<"pre">) {
  return (
    <div className={cn("my-3 overflow-x-auto", className)}>
      {children}
    </div>
  );
}

function renderTable(props: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full border-collapse text-left text-sm" {...props} />
    </div>
  );
}

/**
 * Component for rendering markdown-formatted messages.
 * Supports GitHub-flavored markdown, nested lists, tables, math, and common science notation.
 */
export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  const formattedContent = formatMarkdown(content);

  return (
    <div className={cn("text-sm text-slate-800", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[
          [
            rehypeKatex,
            {
              macros: KATEX_MACROS,
              throwOnError: false,
              strict: false,
            },
          ],
        ]}
        components={{
          h1: (props) => (
            <h1
              className="mb-3 mt-5 text-2xl font-semibold tracking-tight text-slate-950 first:mt-0"
              {...props}
            />
          ),
          h2: (props) => (
            <h2
              className="mb-2 mt-4 text-xl font-semibold tracking-tight text-slate-950 first:mt-0"
              {...props}
            />
          ),
          h3: (props) => (
            <h3
              className="mb-2 mt-3 text-lg font-semibold tracking-tight text-slate-950 first:mt-0"
              {...props}
            />
          ),
          p: renderParagraph,
          pre: renderPre,
          ul: (props) => renderList({ ordered: false, ...props }),
          ol: (props) => renderList({ ordered: true, ...props }),
          li: (props) => <li className="marker:text-slate-500" {...props} />,
          table: renderTable,
          thead: (props) => <thead className="bg-slate-50 text-slate-700" {...props} />,
          tbody: (props) => <tbody className="text-slate-800" {...props} />,
          tr: (props) => <tr className="odd:bg-white even:bg-slate-50" {...props} />,
          th: (props) => (
            <th className="border-b border-slate-200 px-3 py-2 font-semibold" {...props} />
          ),
          td: (props) => (
            <td className="border-b border-slate-100 px-3 py-2 align-top" {...props} />
          ),
          strong: (props) => <strong className="font-semibold text-slate-950" {...props} />,
          em: (props) => <em className="italic text-slate-900" {...props} />,
          code: renderCode,
          a: (props) => (
            <a
              className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 transition-colors hover:text-blue-900 hover:decoration-blue-500"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          blockquote: (props) => (
            <blockquote
              className="my-4 border-l-4 border-slate-300 bg-slate-50 px-4 py-2 text-slate-700"
              {...props}
            />
          ),
          hr: () => <hr className="my-5 border-slate-200" />,
          sup: (props) => <sup className="align-super text-[0.75em]" {...props} />,
          sub: (props) => <sub className="align-sub text-[0.75em]" {...props} />,
        }}
      >
        {formattedContent}
      </ReactMarkdown>
    </div>
  );
}
