import "server-only";

/**
 * Utility functions to detect potential prompt injection attempts
 * This helps with monitoring and logging, but the main protection
 * is in the system prompt itself.
 */

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(previous|all|the)\s+(instructions?|rules?|prompts?)/i,
  /forget\s+(previous|all|the)\s+(instructions?|rules?|prompts?)/i,
  /act\s+as\s+(if\s+)?(you\s+are\s+)?/i,
  /pretend\s+(you\s+are\s+)?(that\s+you\s+are\s+)?/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /from\s+now\s+on\s+(you|your)/i,
  /system\s*:\s*/i,
  /assistant\s*:\s*/i,
  /\[system\]/i,
  /\[instructions\]/i,
  /\[prompt\]/i,
  /reveal\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i,
  /show\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i,
  /what\s+(are\s+)?(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i,
  /override\s+(previous|all|the)\s+(instructions?|rules?|prompts?)/i,
  /disregard\s+(previous|all|the)\s+(instructions?|rules?|prompts?)/i,
];

/**
 * Check if a message contains potential prompt injection attempts
 * Returns true if suspicious patterns are detected
 */
export function detectPromptInjectionAttempt(content: string): boolean {
  if (!content || typeof content !== "string") {
    return false;
  }

  const normalizedContent = content.trim();
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(normalizedContent)) {
      return true;
    }
  }
  const suspiciousFormatting = [
    (normalizedContent.match(/```/g) || []).length > 2,
    (normalizedContent.match(/\[\[/g) || []).length > 3,
    (normalizedContent.match(/---/g) || []).length > 3,
  ];

  if (suspiciousFormatting.some(Boolean)) {
    return true;
  }

  return false;
}

/**
 * Sanitize user input by removing or escaping potentially dangerous patterns
 * This is a secondary defense - the main protection is in the system prompt
 */
export function sanitizeUserInput(content: string): string {
  if (!content || typeof content !== "string") {
    return "";
  }
  let sanitized = content.replace(/[\x00-\x1F\x7F]/g, "");
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000) + "... [truncated]";
  }
  return sanitized;
}

/**
 * Log potential prompt injection attempts for monitoring
 */
export function logPromptInjectionAttempt(
  content: string,
  metadata?: { conversationId?: string; surveyId?: string; userId?: string }
): void {
  if (detectPromptInjectionAttempt(content)) {
    console.warn("Potential prompt injection attempt detected:", {
      contentPreview: content.substring(0, 200),
      contentLength: content.length,
      ...metadata,
      timestamp: new Date().toISOString(),
    });
  }
}
