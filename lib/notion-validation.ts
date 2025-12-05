/**
 * Input validation for Notion integration
 * Provides clear error messages for invalid inputs
 */

import { z } from "zod";

/**
 * Notion token format validation
 * All Notion integration tokens start with "secret_"
 */
export const notionTokenSchema = z
  .string()
  .min(1, "Token is required")
  .startsWith("secret_", "Notion tokens must start with 'secret_'")
  .regex(
    /^secret_[a-zA-Z0-9]{43}$/,
    "Invalid Notion token format. Should be 'secret_' followed by 43 alphanumeric characters"
  );

/**
 * Notion page ID format validation
 * Page IDs are 32 character hex strings, may contain hyphens in URLs
 */
export const notionPageIdSchema = z
  .string()
  .min(1, "Page ID is required")
  .transform((val) => val.replace(/-/g, "")) // Remove hyphens from UUID format
  .pipe(
    z
      .string()
      .regex(
        /^[a-f0-9]{32}$/i,
        "Invalid Notion page ID format. Should be 32 hex characters"
      )
  );

/**
 * Notion database ID format validation (same as page ID)
 */
export const notionDatabaseIdSchema = notionPageIdSchema;

/**
 * Workspace name validation
 */
export const workspaceNameSchema = z
  .string()
  .min(1, "Workspace name cannot be empty")
  .max(100, "Workspace name too long (max 100 characters)")
  .optional();

/**
 * Validate and normalize Notion token
 */
export function validateNotionToken(token: string): {
  success: boolean;
  data?: string;
  error?: string;
} {
  const result = notionTokenSchema.safeParse(token);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.error.errors[0]?.message || "Invalid token",
  };
}

/**
 * Validate and normalize Notion page ID
 */
export function validateNotionPageId(pageId: string): {
  success: boolean;
  data?: string;
  error?: string;
} {
  const result = notionPageIdSchema.safeParse(pageId);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.error.errors[0]?.message || "Invalid page ID",
  };
}

/**
 * Validate and normalize Notion database ID
 */
export function validateNotionDatabaseId(databaseId: string): {
  success: boolean;
  data?: string;
  error?: string;
} {
  return validateNotionPageId(databaseId); // Same format
}

/**
 * Validate workspace name
 */
export function validateWorkspaceName(name?: string): {
  success: boolean;
  data?: string;
  error?: string;
} {
  const result = workspaceNameSchema.safeParse(name);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.error.errors[0]?.message || "Invalid workspace name",
  };
}

/**
 * Extract page ID from Notion URL
 * Handles various Notion URL formats
 */
export function extractPageIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);

    // Extract from pathname
    // Format: /workspace/Page-Name-123abc456def...
    const pathname = urlObj.pathname;
    const parts = pathname.split("/");
    const lastPart = parts[parts.length - 1];

    if (!lastPart) return null;

    // Extract ID after last hyphen
    const idMatch = lastPart.match(/([a-f0-9]{32})$/i);
    if (idMatch) {
      return idMatch[1];
    }

    // Try to extract from query parameter
    const pageId = urlObj.searchParams.get("p");
    if (pageId) {
      return pageId.replace(/-/g, "");
    }

    return null;
  } catch {
    // Not a valid URL, try to extract ID directly
    const cleaned = url.replace(/-/g, "");
    const match = cleaned.match(/([a-f0-9]{32})/i);
    return match ? match[1] : null;
  }
}

/**
 * Comprehensive validation for Notion integration configuration
 */
export function validateNotionIntegrationConfig(config: {
  notionToken: string;
  parentPageId?: string;
  workspaceName?: string;
}): {
  success: boolean;
  data?: {
    notionToken: string;
    parentPageId?: string;
    workspaceName?: string;
  };
  errors?: string[];
} {
  const errors: string[] = [];

  // Validate token
  const tokenResult = validateNotionToken(config.notionToken);
  if (!tokenResult.success) {
    errors.push(`Token: ${tokenResult.error}`);
  }

  // Validate page ID if provided
  let validatedPageId: string | undefined;
  if (config.parentPageId) {
    // Try to extract from URL first
    const extractedId = extractPageIdFromUrl(config.parentPageId);
    const pageIdToValidate = extractedId || config.parentPageId;

    const pageIdResult = validateNotionPageId(pageIdToValidate);
    if (!pageIdResult.success) {
      errors.push(`Page ID: ${pageIdResult.error}`);
    } else {
      validatedPageId = pageIdResult.data;
    }
  }

  // Validate workspace name if provided
  let validatedWorkspaceName: string | undefined;
  if (config.workspaceName) {
    const nameResult = validateWorkspaceName(config.workspaceName);
    if (!nameResult.success) {
      errors.push(`Workspace name: ${nameResult.error}`);
    } else {
      validatedWorkspaceName = nameResult.data;
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      notionToken: tokenResult.data!,
      parentPageId: validatedPageId,
      workspaceName: validatedWorkspaceName,
    },
  };
}
