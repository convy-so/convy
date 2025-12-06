# Notion OAuth Integration - Comprehensive Implementation Plan

## Executive Summary

This document outlines the complete implementation plan for migrating from manual Notion token integration to OAuth 2.0 with automatic synchronization.

---

## Phase 1: Research & Understanding ✅

### Notion OAuth 2.0 Flow (2024)

Based on current Notion documentation:

1. **User-Level Tokens** (as of Oct 2024):
   - Each user gets their own access token
   - Multiple users in same workspace = multiple tokens
   - Better security and permissions

2. **OAuth Flow**:

   ```
   User clicks "Connect Notion"
     → Redirect to Notion authorization URL
     → User grants permissions
     → Notion redirects back with temp code
     → Exchange code for access_token
     → Store access_token (encrypted)
   ```

3. **Required Setup**:
   - Create Public Integration at: https://www.notion.so/my-integrations
   - Get `client_id` and `client_secret`
   - Set redirect URIs (e.g., `https://yourdomain.com/api/notion/callback`)

4. **API Endpoints**:
   - **Authorization**: `https://api.notion.com/v1/oauth/authorize`
   - **Token Exchange**: `https://api.notion.com/v1/oauth/token`
   - **User Info**: `https://api.notion.com/v1/users/me`

---

## Phase 2: Current Codebase Analysis ✅

### What We Sync to Notion

1. **Survey Data** → Notion Database
   - Survey metadata (title, status, dates, ID)
   - Current location: `exportSurveyToNotion()`

2. **Analytics** → Notion Page
   - Overall summary
   - Total conversations
   - Average conversation length
   - Metrics (JSON)
   - Current location: `exportAnalyticsToNotion()`

3. **Conversations** → Notion Page
   - Raw conversation messages
   - Summary
   - Completion status
   - Timestamps
   - Current location: `exportConversationToNotion()`

4. **Insights** (not yet synced but should be)
   - Key findings per conversation
   - Aggregate insights

### Current Architecture

```
app/actions/notion.ts
  ├── configureNotionIntegration()  # Manual token setup
  ├── exportSurveyToNotionAction()
  ├── exportAnalyticsToNotionAction()
  └── exportConversationToNotionAction()

lib/notion.ts
  ├── getNotionClient()
  ├── formatSurveyForNotion()
  ├── formatAnalyticsForNotion()
  ├── formatConversationForNotion()
  └── export functions...

db/schema.ts
  ├── notionIntegrations (stores tokens)
  └── notionExports (tracks exports)

workers/
  ├── conversation-insights.worker.ts
  ├── survey-analytics.worker.ts
  └── (need to add notion-sync.worker.ts)

lib/queue.ts
  └── (need to add notion sync queues)
```

### Problems with Current System

1. ❌ Manual token setup (poor UX)
2. ❌ No auto-sync
3. ❌ Creates duplicate pages on each export
4. ❌ No conflict resolution
5. ❌ No sync status tracking

---

## Phase 3: Data Structure & Display Design

### Optimal Notion Structure

```
📄 [Workspace Root]
  └── 📁 Convy Surveys (Auto-created parent page)
      ├── 📊 Surveys Database
      │   ├── Survey 1
      │   ├── Survey 2
      │   └── ...
      │
      ├── 📁 Survey 1 - Analytics & Insights
      │   ├── 📄 Analytics (updated, not duplicated)
      │   ├── 📁 Conversations
      │   │   ├── 📄 Conversation 1 (with insights)
      │   │   ├── 📄 Conversation 2 (with insights)
      │   │   └── ...
      │   └── 📄 Aggregate Insights
      │
      └── 📁 Survey 2 - Analytics & Insights
          └── ...
```

### Enhanced Data Display

#### Survey Database (Improved)

```typescript
Properties:
  - Name (title)
  - Status (select: draft/active/completed/archived)
  - Survey ID (rich_text)
  - Total Participants (number) NEW
  - Completion Rate (number) NEW
  - Created At (date)
  - Updated At (date)
  - Last Synced (date) NEW
  - View Analytics (url) NEW - link to analytics page
```

#### Analytics Page (Enhanced)

```
📄 [Survey Title] - Analytics

# Survey Analytics
Last updated: [timestamp]

## Key Metrics
- 👥 Total Participants: X
- 💬 Total Conversations: X
- 📊 Completion Rate: X%
- ⏱️ Avg Duration: X minutes
- 🎯 Avg Conversation Length: X messages

## Overall Summary
[AI-generated summary]

## Top Insights
1. [Key finding 1]
2. [Key finding 2]
3. [Key finding 3]

## Metrics Breakdown
[JSON data in code block]

## Recent Activity
[Timeline of recent conversations]
```

#### Conversation Page (Enhanced)

```
📄 Conversation [ID] - [Date]

Status: ✅ Completed | ⏳ In Progress
Duration: X minutes
Messages: X
Created: [date]

## 🎯 Key Insights
- [Insight 1]
- [Insight 2]
- [Insight 3]

## 💡 Summary
[AI-generated summary]

## 📝 Full Conversation
### Participant - Message 1
[content]

### AI - Message 2
[content]
...
```

---

## Phase 4: Background Job Architecture

### Why Background Jobs Are Necessary ✅

1. **Notion API is slow** (~200-500ms per request)
2. **Multiple API calls** per sync (create pages, update properties, etc.)
3. **Don't block user actions** (surveys, conversations)
4. **Retry logic** for failures
5. **Rate limiting** (Notion has limits)

### Queue Architecture

```typescript
// New queues to add to lib/queue.ts

export interface NotionSyncJobData {
  userId: string;
  surveyId: string;
  syncType: "survey" | "analytics" | "conversation" | "full";
  targetId?: string; // conversation ID if syncing single conversation
  forceUpdate?: boolean; // overwrite existing
}

export const notionSyncQueue = new Queue<NotionSyncJobData>("notion-sync", {
  connection: sharedConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
});
```

### Worker Implementation

```
workers/notion-sync.worker.ts
  ├── Handle different sync types
  ├── Check for existing pages (update vs create)
  ├── Batch updates when possible
  ├── Error handling & retries
  └── Emit sync status events
```

### Sync Triggers

1. **New Conversation Completed**

   ```typescript
   // In conversation completion handler
   await enqueueNotionSync({
     userId,
     surveyId,
     syncType: "conversation",
     targetId: conversationId,
   });
   ```

2. **Analytics Updated**

   ```typescript
   // In analytics worker (after generating analytics)
   await enqueueNotionSync({
     userId,
     surveyId,
     syncType: "analytics",
   });
   ```

3. **Survey Status Changed**

   ```typescript
   // In survey update handler
   await enqueueNotionSync({
     userId,
     surveyId,
     syncType: "survey",
   });
   ```

4. **Manual Full Sync** (user triggered)
   ```typescript
   await enqueueNotionSync({
     userId,
     surveyId,
     syncType: "full",
     forceUpdate: true,
   });
   ```

---

## Phase 5: OAuth Implementation

### Database Schema Updates

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

    // OAuth tokens
    accessToken: text("access_token").notNull(), // encrypted
    botId: text("bot_id"), // Notion bot ID
    workspaceId: text("workspace_id"),
    workspaceName: text("workspace_name"),
    workspaceIcon: text("workspace_icon"),

    // Token metadata
    tokenType: text("token_type"), // "bearer"
    owner: jsonb("owner").$type<{
      type: string;
      user?: { id: string; name?: string; email?: string };
    }>(),

    // Duplicated access check
    duplicatedTemplateId: text("duplicated_template_id"),
    requestId: text("request_id"),

    // Notion structure
    parentPageId: text("parent_page_id"),
    surveyDatabaseId: text("survey_database_id"),

    // Sync settings
    autoSync: boolean("auto_sync").default(true).notNull(),
    syncOnNewConversation: boolean("sync_on_new_conversation")
      .default(true)
      .notNull(),
    syncOnAnalyticsUpdate: boolean("sync_on_analytics_update")
      .default(true)
      .notNull(),
    lastSyncedAt: timestamp("last_synced_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [index("notion_integrations_user_id_idx").on(table.userId)]
);

// Add sync status tracking
export const notionSyncStatus = pgTable(
  "notion_sync_status",
  {
    id: text("id").primaryKey(),
    ...timestamps,
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    surveyId: text("survey_id").references(() => surveys.id, {
      onDelete: "cascade",
    }),
    syncType: text("sync_type").notNull(), // 'survey' | 'analytics' | 'conversation' | 'full'
    status: text("status").notNull(), // 'pending' | 'processing' | 'completed' | 'failed'
    error: text("error"),
    jobId: text("job_id"),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("notion_sync_status_user_id_idx").on(table.userId),
    index("notion_sync_status_survey_id_idx").on(table.surveyId),
    index("notion_sync_status_status_idx").on(table.status),
  ]
);
```

### Environment Variables

```bash
# Add to .env
NOTION_CLIENT_ID=your_client_id_here
NOTION_CLIENT_SECRET=your_client_secret_here
NOTION_REDIRECT_URI=https://yourdomain.com/api/notion/callback
```

### API Routes

#### 1. Initiate OAuth Flow

```typescript
// app/api/notion/auth/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const session = await getVerifiedSession();

  const authUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  authUrl.searchParams.set("client_id", env.NOTION_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("owner", "user");
  authUrl.searchParams.set("redirect_uri", env.NOTION_REDIRECT_URI);

  // Store state for security
  const state = crypto.randomUUID();
  // TODO: Store state in session/redis for verification
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
```

#### 2. OAuth Callback Handler

```typescript
// app/api/notion/callback/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/auth/session";
import { db } from "@/db";
import { notionIntegrations } from "@/db/schema";
import { encrypt } from "@/lib/encryption";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getVerifiedSession();

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${env.BETTER_AUTH_URL}/dashboard?notion_error=${error}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${env.BETTER_AUTH_URL}/dashboard?notion_error=no_code`
    );
  }

  // TODO: Verify state

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`
        ).toString("base64")}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: env.NOTION_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange code for token");
    }

    const tokenData = await tokenResponse.json();

    // Encrypt the access token
    const encryptedToken = encrypt(tokenData.access_token);

    // Save or update integration
    const [existing] = await db
      .select()
      .from(notionIntegrations)
      .where(eq(notionIntegrations.userId, session.user.id));

    if (existing) {
      await db
        .update(notionIntegrations)
        .set({
          accessToken: encryptedToken,
          botId: tokenData.bot_id,
          workspaceId: tokenData.workspace_id,
          workspaceName: tokenData.workspace_name,
          workspaceIcon: tokenData.workspace_icon,
          tokenType: tokenData.token_type,
          owner: tokenData.owner,
          duplicatedTemplateId: tokenData.duplicated_template_id,
          requestId: tokenData.request_id,
        })
        .where(eq(notionIntegrations.userId, session.user.id));
    } else {
      await db.insert(notionIntegrations).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        accessToken: encryptedToken,
        botId: tokenData.bot_id,
        workspaceId: tokenData.workspace_id,
        workspaceName: tokenData.workspace_name,
        workspaceIcon: tokenData.workspace_icon,
        tokenType: tokenData.token_type,
        owner: tokenData.owner,
        duplicatedTemplateId: tokenData.duplicated_template_id,
        requestId: tokenData.request_id,
      });
    }

    // Initialize Notion structure (create parent page, database)
    await initializeNotionStructure(session.user.id, tokenData.access_token);

    // Trigger initial sync
    await enqueueNotionSync({
      userId: session.user.id,
      syncType: "full",
    });

    return NextResponse.redirect(
      `${env.BETTER_AUTH_URL}/dashboard?notion_success=true`
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      `${env.BETTER_AUTH_URL}/dashboard?notion_error=unknown`
    );
  }
}
```

---

## Phase 6: Auto-Sync Implementation

### Update vs Create Logic

```typescript
// lib/notion-sync.ts

export async function syncConversationToNotion(
  userId: string,
  conversationId: string
) {
  // 1. Get integration
  const integration = await getNotionIntegration(userId);
  if (!integration || !integration.autoSync) return;

  // 2. Get conversation data
  const conversation = await getConversation(conversationId);
  const survey = await getSurvey(conversation.surveyId);
  const insights = await getConversationInsights(conversationId);

  // 3. Check if already exported
  const existingExport = await db
    .select()
    .from(notionExports)
    .where(
      and(
        eq(notionExports.userId, userId),
        eq(notionExports.exportType, "conversation"),
        eq(notionExports.relatedId, conversationId)
      )
    );

  const notion = getNotionClient(decrypt(integration.accessToken));

  if (existingExport.length > 0) {
    // UPDATE existing page
    const pageId = existingExport[0].notionPageId;

    // Update page content
    await notion.blocks.children.append({
      block_id: pageId,
      children: formatConversationForNotion(conversation, insights),
    });

    // Update page properties (title, etc.)
    await notion.pages.update({
      page_id: pageId,
      properties: {
        // Update status, etc.
      },
    });
  } else {
    // CREATE new page
    const page = await exportConversationToNotion(
      notion,
      integration.parentPageId,
      survey.title,
      conversation,
      insights
    );

    // Track export
    await db.insert(notionExports).values({
      id: crypto.randomUUID(),
      userId,
      surveyId: survey.id,
      exportType: "conversation",
      relatedId: conversationId,
      notionPageId: page.id,
      notionUrl: page.url,
    });
  }
}
```

### Sync Triggers Integration

```typescript
// app/api/surveys/[surveyId]/chat/route.ts
// Add after conversation completion

if (completed) {
  // Existing: Generate insights
  await enqueueConversationInsights({
    conversationId: conversation.id,
    surveyId,
    userId: session.user.id,
  });

  // NEW: Auto-sync to Notion
  await enqueueNotionSync({
    userId: session.user.id,
    surveyId,
    syncType: "conversation",
    targetId: conversation.id,
  });
}
```

```typescript
// workers/survey-analytics.worker.ts
// Add after analytics generation

// NEW: Auto-sync analytics to Notion
await enqueueNotionSync({
  userId: job.data.userId,
  surveyId: job.data.surveyId,
  syncType: "analytics",
});
```

---

## Phase 7: Enhanced Features

### 1. Sync Status Dashboard

```typescript
// app/actions/notion-sync-status.ts

export async function getNotionSyncStatus(surveyId?: string) {
  const session = await getVerifiedSession();

  let query = db
    .select()
    .from(notionSyncStatus)
    .where(eq(notionSyncStatus.userId, session.user.id));

  if (surveyId) {
    query = query.where(eq(notionSyncStatus.surveyId, surveyId));
  }

  const statuses = await query
    .orderBy(desc(notionSyncStatus.createdAt))
    .limit(50);

  return {
    success: true,
    statuses,
  };
}
```

### 2. Manual Sync Controls

```typescript
// app/actions/notion.ts

export async function triggerManualSync(
  surveyId: string,
  syncType: "full" | "analytics" | "conversations"
) {
  const session = await getVerifiedSession();

  await enqueueNotionSync({
    userId: session.user.id,
    surveyId,
    syncType,
    forceUpdate: true,
  });

  return {
    success: true,
    message: "Sync triggered successfully",
  };
}
```

### 3. Sync Settings

```typescript
// app/actions/notion.ts

export async function updateNotionSyncSettings(settings: {
  autoSync?: boolean;
  syncOnNewConversation?: boolean;
  syncOnAnalyticsUpdate?: boolean;
}) {
  const session = await getVerifiedSession();

  await db
    .update(notionIntegrations)
    .set(settings)
    .where(eq(notionIntegrations.userId, session.user.id));

  return {
    success: true,
    message: "Sync settings updated",
  };
}
```

---

## Phase 8: Testing & Validation

### Test Cases

1. **OAuth Flow**
   - [ ] User can initiate OAuth
   - [ ] Callback handles success
   - [ ] Callback handles errors
   - [ ] Token is encrypted
   - [ ] Structure is initialized

2. **Auto-Sync**
   - [ ] New conversation triggers sync
   - [ ] Analytics update triggers sync
   - [ ] Survey update triggers sync
   - [ ] Sync respects settings

3. **Update vs Create**
   - [ ] First sync creates new pages
   - [ ] Subsequent syncs update existing
   - [ ] No duplicate pages
   - [ ] Content is properly updated

4. **Error Handling**
   - [ ] Failed sync retries
   - [ ] Error status is tracked
   - [ ] User is notified
   - [ ] Graceful degradation

---

## Implementation Timeline

### Week 1: Foundation

- [ ] Update database schema
- [ ] Add environment variables
- [ ] Create OAuth routes
- [ ] Test OAuth flow

### Week 2: Sync Infrastructure

- [ ] Create sync queue
- [ ] Implement sync worker
- [ ] Add update logic
- [ ] Create sync triggers

### Week 3: Integration & Testing

- [ ] Integrate triggers
- [ ] Test all sync scenarios
- [ ] Add sync status tracking
- [ ] Create user controls

### Week 4: Polish & Deploy

- [ ] Add UI for OAuth
- [ ] Add sync dashboard
- [ ] Documentation
- [ ] Deploy & monitor

---

## Key Success Metrics

1. ✅ OAuth flow completion rate > 95%
2. ✅ Auto-sync success rate > 98%
3. ✅ Avg sync time < 5 seconds
4. ✅ Zero duplicate pages
5. ✅ User satisfaction > 4.5/5

---

## Next Steps

1. Get approval for this plan
2. Set up Notion public integration
3. Add environment variables
4. Begin Phase 5 implementation
5. Iterate and test

---

## Questions to Resolve

1. Should we support multiple Notion workspaces per user?
2. What's the conflict resolution strategy if user manually edits in Notion?
3. Should we add webhook support from Notion → App?
4. Should we batch sync or real-time sync?
5. What's the retention policy for sync logs?

---

**Created**: December 6, 2024
**Last Updated**: December 6, 2024
**Status**: Ready for Implementation
