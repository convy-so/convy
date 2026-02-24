/**
 * Utility class to manage UI message filtering state (scratchpad, output, etc).
 */
class UIMessageFilterMachine {
  private activeTag: { open: string; close: string } | null = null;
  private buffer = "";

  private readonly SUPPORTED_TAGS = [
    { open: "<scratchpad>", close: "</scratchpad>" },
    { open: "<output>", close: "</output>" },
  ];

  process(chunk: string): string[] {
    this.buffer += chunk;
    const outputs: string[] = [];

    while (this.buffer.length > 0) {
      if (!this.activeTag) {
        // Looking for any opening tag
        let earliestMatch = -1;
        let bestTag = null;

        for (const tag of this.SUPPORTED_TAGS) {
          const idx = this.buffer.indexOf(tag.open);
          if (idx !== -1 && (earliestMatch === -1 || idx < earliestMatch)) {
            earliestMatch = idx;
            bestTag = tag;
          }
        }

        if (bestTag) {
          // Send text before the tag
          if (earliestMatch > 0) {
            outputs.push(this.buffer.slice(0, earliestMatch));
          }
          this.activeTag = bestTag;
          this.buffer = this.buffer.slice(earliestMatch);
        } else {
          // No full tag found. Check for partial tags at the end.
          let maxSafeLength = this.buffer.length;
          for (const tag of this.SUPPORTED_TAGS) {
            const partial = longestSuffixPrefixOf(this.buffer, tag.open);
            if (partial > 0) {
              maxSafeLength = Math.min(
                maxSafeLength,
                this.buffer.length - partial,
              );
            }
          }

          if (maxSafeLength > 0) {
            outputs.push(this.buffer.slice(0, maxSafeLength));
            this.buffer = this.buffer.slice(maxSafeLength);
          }
          break;
        }
      } else {
        // Inside a tag, looking for the close tag
        const closeIdx = this.buffer.indexOf(this.activeTag.close);

        if (closeIdx !== -1) {
          this.buffer = this.buffer.slice(
            closeIdx + this.activeTag.close.length,
          );
          this.activeTag = null;
        } else {
          // Tag is still open. But we must be careful not to hold text that can't be part of the close tag.
          // However, since we don't know the closing tag's full content yet, we buffer until we find it or the stream ends.
          break;
        }
      }
    }
    return outputs;
  }

  flush(): string {
    if (this.activeTag) {
      console.warn(
        `[UIMessageFilter] Stream ended while inside ${this.activeTag.open}. Dropping buffer.`,
      );
      this.buffer = "";
      return "";
    }
    const final = this.buffer;
    this.buffer = "";
    return final;
  }
}

/**
 * Creates a TransformStream that strips <scratchpad>…</scratchpad> and <output>…</output> blocks.
 */
export function createScratchpadFilter(): TransformStream<string, string> {
  const machine = new UIMessageFilterMachine();

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      for (const output of machine.process(chunk)) {
        controller.enqueue(output);
      }
    },
    flush(controller) {
      const final = machine.flush();
      if (final) controller.enqueue(final);
    },
  });
}

/**
 * Returns the length of the longest suffix of `str` that is also a prefix of `tag`.
 */
function longestSuffixPrefixOf(str: string, tag: string): number {
  const maxCheck = Math.min(str.length, tag.length - 1);
  for (let len = maxCheck; len > 0; len--) {
    const suffix = str.slice(str.length - len);
    if (tag.startsWith(suffix)) {
      return len;
    }
  }
  return 0;
}

/**
 * Filters internal tags from an async iterable of text chunks.
 */
export async function* filterScratchpad(
  source: AsyncIterable<string>,
): AsyncGenerator<string> {
  const machine = new UIMessageFilterMachine();

  for await (const chunk of source) {
    for (const output of machine.process(chunk)) {
      yield output;
    }
  }

  const final = machine.flush();
  if (final) yield final;
}

/**
 * Creates a TransformStream that filters internal tags from AI SDK UI message stream parts.
 */
export function createUIMessageFilter(): TransformStream<any, any> {
  const machine = new UIMessageFilterMachine();

  return new TransformStream({
    transform(chunk, controller) {
      const text = chunk.textDelta ?? chunk.content;

      if (chunk.type === "text-delta" && typeof text === "string") {
        const outputs = machine.process(text);
        for (const out of outputs) {
          controller.enqueue({ ...chunk, textDelta: out, content: out });
        }
      } else if (chunk.type === "message" && chunk.message?.content) {
        if (Array.isArray(chunk.message.content)) {
          chunk.message.content = chunk.message.content.map((part: any) => {
            if (part.type === "text" && typeof part.text === "string") {
              return { ...part, text: stripInternalTags(part.text) };
            }
            return part;
          });
        } else if (typeof chunk.message.content === "string") {
          chunk.message.content = stripInternalTags(chunk.message.content);
        }
        controller.enqueue(chunk);
      } else {
        controller.enqueue(chunk);
      }
    },
    flush(controller) {
      const final = machine.flush();
      if (final) {
        controller.enqueue({
          type: "text-delta",
          textDelta: final,
          content: final,
        });
      }
    },
  });
}

/**
 * Strips all internal tags (<scratchpad>, <output>) from a complete string.
 */
export function stripInternalTags(text: string): string {
  return text
    .replace(/<scratchpad>[\s\S]*?<\/scratchpad>/g, "")
    .replace(/<output>[\s\S]*?<\/output>/g, "");
}

/**
 * Compatibility export for original name
 */
export const stripScratchpadFromText = stripInternalTags;
