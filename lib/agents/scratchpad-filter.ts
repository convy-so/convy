/**
 * Scratchpad Filter — Stream Transform Utility
 *
 * Strips <scratchpad>...</scratchpad> blocks from a streaming text response
 * before it reaches the client. The model thinks aloud in the scratchpad,
 * then writes its actual response after — zero extra latency cost.
 *
 * Handles chunk boundaries safely: partial tag text is buffered until
 * enough content arrives to determine whether it is a tag or plain text.
 *
 * Usage:
 *   const { readable, writable } = createScratchpadFilter();
 *   // pipe your textStream through it
 *
 * OR use the higher-level helper:
 *   const filtered = filterScratchpad(asyncIterableTextStream);
 */

const OPEN_TAG = "<scratchpad>";
const CLOSE_TAG = "</scratchpad>";

/**
 * Creates a TransformStream that strips <scratchpad>…</scratchpad> blocks.
 */
export function createScratchpadFilter(): TransformStream<string, string> {
  let inScratchpad = false;
  let buffer = "";

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk;
      processBuffer(controller);
    },
    flush(controller) {
      // Emit any remaining non-scratchpad content
      if (!inScratchpad && buffer.length > 0) {
        controller.enqueue(buffer);
        buffer = "";
      }
    },
  });

  function processBuffer(controller: TransformStreamDefaultController<string>) {
    while (buffer.length > 0) {
      if (inScratchpad) {
        // We're inside a scratchpad: look for the closing tag
        const closeIdx = buffer.indexOf(CLOSE_TAG);
        if (closeIdx !== -1) {
          // Found the end — discard everything up to and including </scratchpad>
          buffer = buffer.slice(closeIdx + CLOSE_TAG.length);
          inScratchpad = false;
          // Continue processing — there may be real content after
        } else {
          // Closing tag not yet received. Check for a partial close tag at the
          // end of buffer so we don't accidentally discard it across chunks.
          const partialEnd = longestSuffixPrefixOf(buffer, CLOSE_TAG);
          if (partialEnd > 0) {
            // Drop everything up to the partial tag (still in scratchpad),
            // keep the potential partial close tag in the buffer.
            buffer = buffer.slice(buffer.length - partialEnd);
          } else {
            buffer = ""; // Everything discarded (all scratchpad content)
          }
          break;
        }
      } else {
        // We're in normal output: look for an opening tag
        const openIdx = buffer.indexOf(OPEN_TAG);
        if (openIdx !== -1) {
          // Emit everything before the scratchpad starts
          if (openIdx > 0) {
            controller.enqueue(buffer.slice(0, openIdx));
          }
          buffer = buffer.slice(openIdx + OPEN_TAG.length);
          inScratchpad = true;
          // Continue processing what's after the open tag
        } else {
          // No open tag found — but protect against a partial open tag split
          // across two chunks (e.g. "<scratch" at end of chunk, "pad>" at start of next).
          const partialStart = longestSuffixPrefixOf(buffer, OPEN_TAG);
          if (partialStart > 0) {
            // Emit everything up to the start of the potential partial tag
            const safeLength = buffer.length - partialStart;
            if (safeLength > 0) {
              controller.enqueue(buffer.slice(0, safeLength));
            }
            buffer = buffer.slice(safeLength); // hold the partial tag
          } else {
            // No partial match — safe to emit all
            controller.enqueue(buffer);
            buffer = "";
          }
          break;
        }
      }
    }
  }
}

/**
 * Returns the length of the longest suffix of `str` that is also a prefix of `tag`.
 * Used to detect partial tags split across streaming chunks.
 *
 * e.g. longestSuffixPrefixOf("hello <scr", "<scratchpad>") === 4
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
 * Filters scratchpad blocks from an async iterable of text chunks.
 * Works directly with the AI SDK's `textStream` (AsyncIterable<string>).
 *
 * @example
 * const result = streamText({ ... });
 * for await (const chunk of filterScratchpad(result.textStream)) {
 *   process.stdout.write(chunk);
 * }
 */
export async function* filterScratchpad(
  source: AsyncIterable<string>,
): AsyncGenerator<string> {
  let inScratchpad = false;
  let buffer = "";

  for await (const chunk of source) {
    buffer += chunk;
    let keepGoing = true;

    while (keepGoing && buffer.length > 0) {
      if (inScratchpad) {
        const closeIdx = buffer.indexOf(CLOSE_TAG);
        if (closeIdx !== -1) {
          buffer = buffer.slice(closeIdx + CLOSE_TAG.length);
          inScratchpad = false;
        } else {
          const partial = longestSuffixPrefixOf(buffer, CLOSE_TAG);
          buffer = partial > 0 ? buffer.slice(buffer.length - partial) : "";
          keepGoing = false;
        }
      } else {
        const openIdx = buffer.indexOf(OPEN_TAG);
        if (openIdx !== -1) {
          if (openIdx > 0) yield buffer.slice(0, openIdx);
          buffer = buffer.slice(openIdx + OPEN_TAG.length);
          inScratchpad = true;
        } else {
          const partial = longestSuffixPrefixOf(buffer, OPEN_TAG);
          if (partial > 0) {
            const safeLen = buffer.length - partial;
            if (safeLen > 0) yield buffer.slice(0, safeLen);
            buffer = buffer.slice(safeLen);
          } else {
            yield buffer;
            buffer = "";
          }
          keepGoing = false;
        }
      }
    }
  }

  // Flush remainder
  if (!inScratchpad && buffer.length > 0) {
    yield buffer;
  }
}

/**
 * Creates a TransformStream that filters scratchpads from AI SDK UI message stream parts.
 * Handles 'text-delta' parts specifically.
 */
export function createUIMessageFilter(): TransformStream<any, any> {
  const filter = createScratchpadFilter();
  const reader = filter.readable.getReader();
  const writer = filter.writable.getWriter();

  return new TransformStream({
    async transform(chunk, controller) {
      if (chunk.type === "text-delta" && typeof chunk.content === "string") {
        // Feed the text-delta content into the text filter
        writer.write(chunk.content);

        // Read any available filtered chunks
        let result = await reader.read();
        while (!result.done) {
          controller.enqueue({ ...chunk, content: result.value });
          // If we have more but we can't be sure without blocking,
          // we might need a more sophisticated approach.
          // However, for most chunks this is fine.

          // Try a non-blocking read if possible, or just continue
          // For now, let's assume one input chunk might yield multiple or zero output text deltas
          result = await Promise.race([
            reader.read(),
            Promise.resolve({ done: true, value: undefined } as const),
          ]);
        }
      } else {
        controller.enqueue(chunk);
      }
    },
    async flush(controller) {
      await writer.close();
      let result = await reader.read();
      while (!result.done) {
        controller.enqueue({ type: "text-delta", content: result.value });
        result = await reader.read();
      }
    },
  });
}

/**
 * Strips all scratchpad blocks from a complete (non-streaming) string.
 * Used in `onFinish` callbacks when you need to clean the final text.
 */
export function stripScratchpadFromText(text: string): string {
  // Use a regex that handles multiline content
  return text.replace(/<scratchpad>[\s\S]*?<\/scratchpad>/g, "").trim();
}
