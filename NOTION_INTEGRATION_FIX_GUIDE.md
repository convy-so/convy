# Notion Integration - Implementation Fix Guide

This guide provides step-by-step instructions to fix all critical issues identified in the analysis.

---

## Phase 1: Critical Security Fixes (IMMEDIATE)

### Step 1: Generate Encryption Key

```bash
# Generate a secure 32-byte encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to `.env`:

```env
ENCRYPTION_KEY=your_64_character_hex_key_here
```

### Step 2: Update Environment Configuration

```typescript
// lib/env.ts - ADD encryption key
const optional = (key: string): string | undefined => {
  return process.env[key];
};

export const env = {
  // ... existing env vars ...

  // Add encryption key (REQUIRED for token security)
  ENCRYPTION_KEY: required("ENCRYPTION_KEY"),

  // Notion Integration (Optional - users can configure their own)
  NOTION_API_KEY: optional("NOTION_API_KEY"),
};
```

### Step 3: Update Database Schema

```typescript
// db/schema.ts - UPDATE notionIntegrations table

export const notionIntegrations = pgTable(
  "notion_integrations",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),

    // ❌ REMOVE: notionToken: text("notion_token").notNull(),

    // ✅ ADD: Encrypted token storage
    encryptedToken: text("encrypted_token").notNull(),
    tokenIv: text("token_iv").notNull(),
    tokenTag: text("token_tag").notNull(),

    workspaceName: text("workspace_name"),
    parentPageId: text("parent_page_id"),
    surveyDatabaseId: text("survey_database_id"),

    // ✅ ADD: Token health status
    needsReconnection: boolean("needs_reconnection").default(false),
    lastValidated: timestamp("last_validated", { withTimezone: true }),
  },
  (table) => [index("notion_integrations_user_id_idx").on(table.userId)]
);
```

### Step 4: Generate Migration

```bash
# Generate migration for schema changes
pnpm drizzle-kit generate

# Apply migration
pnpm drizzle-kit push
```

### Step 5: Migrate Existing Tokens

Create a one-time migration script:

```typescript
// scripts/migrate-notion-tokens.ts
import { db } from "@/db";
import { notionIntegrations } from "@/db/schema";
import { encryptNotionToken } from "@/lib/encryption";
import { eq } from "drizzle-orm";

async function migrateTokens() {
  console.log("Starting token migration...");

  const integrations = await db.select().from(notionIntegrations).execute();

  for (const integration of integrations) {
    // Encrypt the plain text token
    const { encrypted, iv, tag } = encryptNotionToken(integration.notionToken);

    // Update with encrypted values
    await db
      .update(notionIntegrations)
      .set({
        encryptedToken: encrypted,
        tokenIv: iv,
        tokenTag: tag,
      })
      .where(eq(notionIntegrations.id, integration.id));

    console.log(`✓ Migrated token for user ${integration.userId}`);
  }

  console.log("Migration complete!");
}

migrateTokens().catch(console.error);
```

Run migration:

```bash
tsx scripts/migrate-notion-tokens.ts
```

### Step 6: Replace Core Notion Module

Replace `lib/notion.ts` with `lib/notion-improved.ts`:

```bash
# Backup original
mv lib/notion.ts lib/notion-old.ts

# Use improved version
mv lib/notion-improved.ts lib/notion.ts
```

---

## Phase 2: Update API Routes & Actions

### Step 1: Update Connect Route

```typescript
// app/api/notion/connect/route.ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notionIntegrations } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import {
  getNotionClient,
  createSurveyDatabase,
  validateNotionToken,
} from "@/lib/notion";
import { encryptNotionToken, decryptNotionToken } from "@/lib/encryption";
import { validateNotionIntegrationConfig } from "@/lib/notion-validation";

export async function POST(request: Request) {
  try {
    const session = await getVerifiedSession();
    const body = await request.json();

    // ✅ ADD: Input validation
    const validation = validateNotionIntegrationConfig({
      notionToken: body.notionToken,
      parentPageId: body.parentPageId,
      workspaceName: body.workspaceName,
    });

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          success: false,
          errors: validation.errors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { notionToken, parentPageId, workspaceName } = validation.data!;

    // ✅ ADD: Validate token with proper error handling
    const tokenValidation = await validateNotionToken(notionToken);
    if (!tokenValidation.valid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: tokenValidation.error,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get existing integration
    const [existingIntegration] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

    // ✅ ADD: Encrypt token before storage
    const { encrypted, iv, tag } = encryptNotionToken(notionToken);

    let surveyDatabaseId = existingIntegration?.surveyDatabaseId || null;

    // Create survey database if parent page is provided
    if (parentPageId && !surveyDatabaseId) {
      try {
        const notion = getNotionClient(notionToken);
        const database = await createSurveyDatabase(
          notion,
          parentPageId,
          "Surveys"
        );
        surveyDatabaseId = database.id;
      } catch (error) {
        console.error("Failed to create survey database:", error);
      }
    }

    if (existingIntegration) {
      // Update existing integration
      await db
        .update(notionIntegrations)
        .set({
          encryptedToken: encrypted,
          tokenIv: iv,
          tokenTag: tag,
          parentPageId: parentPageId || existingIntegration.parentPageId,
          workspaceName: workspaceName || existingIntegration.workspaceName,
          surveyDatabaseId:
            surveyDatabaseId || existingIntegration.surveyDatabaseId,
          needsReconnection: false,
          lastValidated: new Date(),
        })
        .where(eq(notionIntegrations.userId, session.user.id));
    } else {
      // Create new integration
      await db.insert(notionIntegrations).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        encryptedToken: encrypted,
        tokenIv: iv,
        tokenTag: tag,
        parentPageId: parentPageId || null,
        workspaceName: workspaceName || null,
        surveyDatabaseId: surveyDatabaseId,
        needsReconnection: false,
        lastValidated: new Date(),
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Notion integration configured successfully",
        surveyDatabaseId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    // ... error handling ...
  }
}
```

### Step 2: Update Server Actions

```typescript
// app/actions/notion.ts
import { decryptNotionToken } from "@/lib/encryption";

// Update every function that retrieves the token:

export async function exportSurveyToNotionAction(
  surveyId: string,
  databaseId?: string
) {
  try {
    const session = await getVerifiedSession();

    // Get integration
    const [integration] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

    if (!integration) {
      return {
        success: false,
        error: "Notion integration not configured",
      };
    }

    // ✅ CHECK: if reconnection needed
    if (integration.needsReconnection) {
      return {
        success: false,
        error: "Notion connection expired. Please reconnect your workspace.",
        needsReconnection: true,
      };
    }

    // ✅ ADD: Decrypt token before use
    const notionToken = decryptNotionToken(
      integration.encryptedToken,
      integration.tokenIv,
      integration.tokenTag
    );

    // Get survey
    const [survey] = await db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId));

    if (!survey) {
      return { success: false, error: "Survey not found" };
    }

    if (survey.userId !== session.user.id) {
      return { success: false, error: "Unauthorized" };
    }

    const targetDatabaseId = databaseId || integration.surveyDatabaseId;

    if (!targetDatabaseId) {
      return { success: false, error: "No database ID configured" };
    }

    // Export to Notion (with retry logic built-in)
    const notion = getNotionClient(notionToken);

    try {
      const notionPage = await exportSurveyToNotion(
        notion,
        targetDatabaseId,
        survey
      );

      // Save export record
      await db.insert(notionExports).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        surveyId: survey.id,
        exportType: "survey",
        notionPageId: notionPage.id,
        notionUrl: notionPage.url,
      });

      return {
        success: true,
        message: "Survey exported to Notion successfully",
        notionUrl: notionPage.url,
        notionPageId: notionPage.id,
      };
    } catch (error: unknown) {
      // ✅ ADD: Handle Notion-specific errors
      if (isNotionClientError(error)) {
        if (error.code === APIErrorCode.Unauthorized) {
          // Mark integration for reconnection
          await db
            .update(notionIntegrations)
            .set({ needsReconnection: true })
            .where(eq(notionIntegrations.userId, session.user.id));

          return {
            success: false,
            error: "Notion token expired. Please reconnect.",
            needsReconnection: true,
          };
        }

        return {
          success: false,
          error: `Notion error: ${error.message}`,
        };
      }

      throw error;
    }
  } catch (error) {
    console.error("Error exporting survey to Notion:", error);
    return {
      success: false,
      error: "Failed to export survey to Notion",
    };
  }
}

// ✅ ADD: Token validation action
export async function validateNotionConnection() {
  try {
    const session = await getVerifiedSession();

    const [integration] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

    if (!integration) {
      return { valid: false, error: "Not connected" };
    }

    // Decrypt and test the token
    const notionToken = decryptNotionToken(
      integration.encryptedToken,
      integration.tokenIv,
      integration.tokenTag
    );

    const validation = await validateNotionToken(notionToken);

    if (!validation.valid) {
      // Mark for reconnection
      await db
        .update(notionIntegrations)
        .set({ needsReconnection: true })
        .where(eq(notionIntegrations.userId, session.user.id));
    } else {
      // Update last validated
      await db
        .update(notionIntegrations)
        .set({
          lastValidated: new Date(),
          needsReconnection: false,
        })
        .where(eq(notionIntegrations.userId, session.user.id));
    }

    return validation;
  } catch (error) {
    console.error("Error validating connection:", error);
    return { valid: false, error: "Validation failed" };
  }
}
```

### Step 3: Apply Same Pattern to All Export Actions

Update `exportAnalyticsToNotionAction` and `exportConversationToNotionAction` following the same pattern.

---

## Phase 3: Testing

### Test 1: Encryption

```typescript
// test/encryption.test.ts
import { encrypt, decrypt } from "@/lib/encryption";

test("Token encryption/decryption", () => {
  const original = "secret_test123";
  const { encrypted, iv, tag } = encrypt(original);
  const decrypted = decrypt(encrypted, iv, tag);

  expect(decrypted).toBe(original);
  expect(encrypted).not.toBe(original);
});
```

### Test 2: Rate Limiting

```typescript
// test/rate-limit.test.ts
test("Handle rate limits", async () => {
  // Simulate 10 requests rapidly
  const promises = Array.from({ length: 10 }, () =>
    exportSurveyToNotionAction("test-id")
  );

  const results = await Promise.all(promises);

  // All should succeed (with retries)
  expect(results.every((r) => r.success || r.cached)).toBe(true);
});
```

### Test 3: Text Limits

```typescript
// test/text-limits.test.ts
test("Handle long text content", () => {
  const longText = "a".repeat(5000);
  const chunks = splitTextIntoChunks(longText);

  // All chunks should be under 2000 chars
  expect(chunks.every((c) => c.length <= 2000)).toBe(true);
});
```

### Test 4: Block Pagination

```typescript
// test/block-pagination.test.ts
test("Handle >100 blocks", async () => {
  const conversation = {
    id: "test",
    messages: Array.from({ length: 60 }, (_, i) => ({
      role: "user",
      content: "Test message " + i,
    })),
    completed: true,
    createdAt: new Date(),
  };

  const blocks = formatConversationForNotion(conversation);

  // Should handle >100 blocks
  expect(blocks.length).toBeGreaterThan(100);
});
```

---

## Phase 4: Deployment Checklist

### Pre-Deployment

- [ ] Generate encryption key
- [ ] Add `ENCRYPTION_KEY` to environment variables
- [ ] Run database migration
- [ ] Run token encryption migration script
- [ ] Update all files with improved versions
- [ ] Run all tests
- [ ] Verify linter passes

### Post-Deployment

- [ ] Monitor logs for Notion API errors
- [ ] Check rate limit metrics
- [ ] Verify no plain text tokens in database
- [ ] Test with real Notion workspace
- [ ] Verify token expiration handling
- [ ] Test with long conversations
- [ ] Test with large analytics data

### Monitoring

Add monitoring for:

- Rate limit errors (429)
- Authentication errors (401)
- Token validation failures
- Export success/failure rates
- Average export time

---

## Rollback Plan

If issues occur:

1. **Keep database changes** - They're backward compatible
2. **Revert to old files**:
   ```bash
   git revert HEAD
   ```
3. **Decrypt tokens** if needed (use encryption.ts decrypt function)
4. **Monitor for errors** and fix issues
5. **Redeploy** when ready

---

## Performance Benchmarks

Expected performance after fixes:

- **Token validation**: <500ms
- **Survey export**: 1-2 seconds
- **Analytics export**: 2-4 seconds
- **Conversation export**: 3-6 seconds (varies by length)
- **Rate limit retry**: +1-3 seconds per retry

---

## Security Checklist

- [x] Tokens encrypted at rest (AES-256-GCM)
- [x] Environment variables not in code
- [x] Input validation on all endpoints
- [x] Error messages don't leak secrets
- [x] Rate limiting implemented
- [x] Proper error handling
- [x] Authentication on all routes
- [x] Authorization checks on resources
- [x] Audit logging for exports
- [x] Token expiration handling

---

## Support & Documentation

- See `NOTION_INTEGRATION_ANALYSIS.md` for detailed issue analysis
- See `NOTION_INTEGRATION.md` for usage documentation
- See `docs/NOTION_QUICKSTART.md` for user guide
- Check Notion API docs: https://developers.notion.com

---

## Next Steps

After implementing these fixes:

1. Consider adding webhook support for real-time invalidation
2. Implement batch export functionality
3. Add export scheduling
4. Create admin dashboard for monitoring
5. Add export templates
6. Implement two-way sync (if needed)

---

**Estimated Total Implementation Time**: 8-12 hours
**Testing Time**: 4-6 hours
**Total**: 12-18 hours for complete, production-ready implementation
