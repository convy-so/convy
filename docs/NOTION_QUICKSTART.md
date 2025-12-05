# Notion Integration Quick Start Guide

Get your Notion integration up and running in 5 minutes!

## Step 1: Create a Notion Integration (2 minutes)

1. Visit https://www.notion.so/my-integrations
2. Click **"+ New integration"**
3. Fill in:
   - **Name**: "Convy Survey Integration"
   - **Associated workspace**: Select your workspace
   - **Capabilities**: Check all (Read, Update, Insert content)
4. Click **"Submit"**
5. **Copy your Integration Token** (starts with `secret_`)
   - ⚠️ Keep this safe! Don't share it publicly

## Step 2: Prepare Your Notion Workspace (1 minute)

1. Open or create a Notion page where you want survey data
2. Click **"Share"** (top right)
3. Click **"Invite"** and select your integration name
4. **Copy the Page ID** from URL:
   ```
   https://notion.so/workspace/Page-Name-abc123def456...
                                           ^^^^^^^^^^^^^^^^
                                           This is your Page ID
   ```

## Step 3: Connect in Your Application (1 minute)

### Option A: Using the UI (Recommended)

```typescript
// In your settings/integrations page
import { configureNotionIntegration } from "@/app/actions/notion";

const connectNotion = async () => {
  const result = await configureNotionIntegration({
    notionToken: "secret_xxx...",
    parentPageId: "abc123def456...",
    workspaceName: "My Workspace", // Optional
  });

  if (result.success) {
    console.log("Connected! Database ID:", result.surveyDatabaseId);
  }
};
```

### Option B: Using Environment Variables

Add to `.env`:

```env
NOTION_API_KEY=secret_your_token_here
```

## Step 4: Start Exporting! (30 seconds)

### Export a Survey

```typescript
import { exportSurveyToNotionAction } from "@/app/actions/notion";

// Export to your connected Notion database
const result = await exportSurveyToNotionAction("survey-id-123");

if (result.success) {
  // Open in Notion
  window.open(result.notionUrl, "_blank");
}
```

### Export Analytics

```typescript
import { exportAnalyticsToNotionAction } from "@/app/actions/notion";

const result = await exportAnalyticsToNotionAction("survey-id-123");
```

### Export Conversations

```typescript
import { exportConversationToNotionAction } from "@/app/actions/notion";

const result = await exportConversationToNotionAction("conversation-id-456");
```

## What Gets Created?

### 1. Survey Database

A structured database with columns:

- **Name**: Survey title
- **Status**: Current status (active, completed, etc.)
- **Survey ID**: Unique identifier
- **Created At**: When it was created
- **Updated At**: Last modification

### 2. Analytics Pages

Beautifully formatted pages with:

- Overall summary
- Key metrics (total conversations, avg length)
- Detailed metrics in JSON format

### 3. Conversation Pages

Detailed conversation logs with:

- Message history (participant & AI)
- Timestamps
- Conversation summary
- Completion status

## Quick Tips

✅ **DO**:

- Keep your integration token secure
- Test with a dummy page first
- Check export history to avoid duplicates

❌ **DON'T**:

- Share your integration token
- Forget to invite the integration to your page
- Export the same data multiple times unnecessarily

## Troubleshooting

### "Invalid Notion token"

- Verify you copied the entire token (starts with `secret_`)
- Make sure the integration is still active in Notion

### "No parent page ID found"

- Provide a `parentPageId` when configuring
- Make sure you shared the page with your integration

### "Failed to export"

- Check that the page/database still exists
- Verify the integration has proper permissions
- Look for rate limit errors (max 3 requests/second)

## Example: Complete Integration Flow

```typescript
"use client";

import { useState } from "react";
import {
  configureNotionIntegration,
  exportSurveyToNotionAction,
  getNotionIntegrationStatus
} from "@/app/actions/notion";

export function NotionIntegration({ surveyId }: { surveyId: string }) {
  const [connected, setConnected] = useState(false);

  // Check if already connected
  const checkStatus = async () => {
    const status = await getNotionIntegrationStatus();
    setConnected(status.connected);
  };

  // Connect Notion
  const connect = async (token: string, pageId: string) => {
    const result = await configureNotionIntegration({
      notionToken: token,
      parentPageId: pageId,
    });

    if (result.success) {
      setConnected(true);
      alert("Connected to Notion!");
    }
  };

  // Export survey
  const exportSurvey = async () => {
    const result = await exportSurveyToNotionAction(surveyId);

    if (result.success) {
      window.open(result.notionUrl, "_blank");
    }
  };

  return (
    <div>
      {!connected ? (
        <button onClick={() => checkStatus()}>Check Connection</button>
      ) : (
        <button onClick={exportSurvey}>Export to Notion</button>
      )}
    </div>
  );
}
```

## API Reference

### Check Connection Status

```typescript
const status = await getNotionIntegrationStatus();
// Returns: { connected: boolean, integration?: {...} }
```

### Configure Integration

```typescript
const result = await configureNotionIntegration({
  notionToken: string,
  parentPageId?: string,
  workspaceName?: string
});
```

### Export Data

```typescript
// Survey
await exportSurveyToNotionAction(surveyId, databaseId?);

// Analytics
await exportAnalyticsToNotionAction(surveyId, parentPageId?);

// Conversation
await exportConversationToNotionAction(conversationId, parentPageId?);
```

### View Export History

```typescript
const { exports } = await getNotionExports();
// Or for a specific survey:
const { exports } = await getSurveyNotionExports(surveyId);
```

## Next Steps

1. ✅ **Set up your integration** (you're here!)
2. 📊 **Create a dashboard page** in Notion for all your surveys
3. 🔄 **Set up automatic exports** after survey completion
4. 👥 **Share with your team** using Notion's collaboration features
5. 📈 **Analyze trends** across multiple surveys

## Need Help?

- 📚 Full documentation: `NOTION_INTEGRATION.md`
- 🔧 Notion API docs: https://developers.notion.com
- 🐛 Found a bug? Check server logs for detailed errors

---

**That's it!** You're ready to start exporting your survey data to Notion. 🚀
