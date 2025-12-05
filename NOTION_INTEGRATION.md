# Notion Integration Documentation

This document provides comprehensive information about the Notion integration feature in the Convy survey application.

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Setup Instructions](#setup-instructions)
5. [API Endpoints](#api-endpoints)
6. [Server Actions](#server-actions)
7. [Database Schema](#database-schema)
8. [Usage Examples](#usage-examples)
9. [Error Handling](#error-handling)
10. [Best Practices](#best-practices)

---

## Overview

The Notion integration allows users to export their survey data, analytics, and conversations directly to their Notion workspace. This integration provides seamless synchronization between your survey application and Notion, enabling better data management and collaboration.

### Key Benefits

- **Centralized Documentation**: Keep all survey data in one place with your other business documentation
- **Real-time Sync**: Export surveys, analytics, and conversations to Notion as needed
- **Structured Data**: Automatically formatted pages and databases in Notion
- **Team Collaboration**: Share survey insights with your team through Notion's collaboration features

---

## Features

### 1. Workspace Connection

- Connect your Notion workspace using an integration token
- Automatic verification of credentials
- Support for multiple workspace configurations

### 2. Database Management

- Automatic creation of survey databases in Notion
- Structured schema with properties for survey metadata
- Support for custom parent pages

### 3. Data Export

Export three types of data to Notion:

#### a. Surveys

- Export survey metadata and configuration
- Includes objective, target audience, status, and creation dates
- Organized in a database format with filters and views

#### b. Analytics

- Export comprehensive survey analytics
- Includes summaries, metrics, and key insights
- Formatted as rich Notion pages with structured blocks

#### c. Conversations

- Export individual or multiple survey conversations
- Includes participant messages, AI responses, and summaries
- Timeline view of conversation flow

### 4. Export History

- Track all exports with timestamps
- Quick access to exported Notion pages
- Filter exports by survey or type

---

## Architecture

### Technology Stack

- **Notion SDK**: `@notionhq/client` v5.4.0
- **Database**: PostgreSQL with Drizzle ORM
- **API Layer**: Next.js App Router API routes
- **Server Actions**: Server-side functions for client interaction

### Component Structure

```
lib/
  └── notion.ts                    # Notion client and utility functions

app/
  ├── api/notion/
  │   ├── connect/route.ts         # Connection management
  │   └── export/
  │       ├── survey/route.ts      # Survey export endpoint
  │       ├── analytics/route.ts   # Analytics export endpoint
  │       └── conversation/route.ts # Conversation export endpoint
  └── actions/
      └── notion.ts                # Server actions for client-side usage

db/
  └── schema.ts                    # Database schema (notionIntegrations, notionExports)
```

---

## Setup Instructions

### 1. Create a Notion Integration

1. Go to [Notion Developers Portal](https://www.notion.so/my-integrations)
2. Click **"+ New integration"**
3. Give your integration a name (e.g., "Convy Survey Integration")
4. Select the workspace you want to connect
5. Set capabilities:
   - ✅ Read content
   - ✅ Update content
   - ✅ Insert content
6. Click **"Submit"** to create the integration
7. Copy the **"Internal Integration Token"** (starts with `secret_`)

### 2. Share a Notion Page

1. Create or open a Notion page where you want to store survey data
2. Click **"Share"** in the top right
3. Click **"Invite"** and select your integration
4. Copy the page ID from the URL:
   ```
   https://notion.so/My-Page-123abc456def789...
                        ^^^^^^^^^^^^^^^^^^^^^^^^
                        This is your page ID
   ```

### 3. Configure Environment Variables (Optional)

Add to your `.env` file:

```env
# Optional: System-wide Notion integration
NOTION_API_KEY=secret_your_notion_integration_token
```

**Note**: Users can also configure their own Notion integration through the application UI without setting environment variables.

### 4. Database Migration

The database schema has already been pushed to your database. The following tables were created:

- `notion_integrations` - Stores user Notion connection settings
- `notion_exports` - Tracks all exports to Notion

---

## API Endpoints

### 1. Connection Management

#### POST `/api/notion/connect`

Configure Notion integration for the authenticated user.

**Request Body**:

```typescript
{
  notionToken: string;        // Required: Notion integration token
  parentPageId?: string;      // Optional: Parent page for exports
  workspaceName?: string;     // Optional: Workspace display name
}
```

**Response**:

```typescript
{
  success: boolean;
  message: string;
  surveyDatabaseId?: string;  // ID of created survey database
}
```

#### GET `/api/notion/connect`

Get current Notion integration status.

**Response**:

```typescript
{
  connected: boolean;
  integration?: {
    id: string;
    workspaceName: string | null;
    parentPageId: string | null;
    surveyDatabaseId: string | null;
    createdAt: Date;
  };
}
```

#### DELETE `/api/notion/connect`

Disconnect Notion integration.

**Response**:

```typescript
{
  success: boolean;
  message: string;
}
```

### 2. Export Endpoints

#### POST `/api/notion/export/survey`

Export a survey to Notion database.

**Request Body**:

```typescript
{
  surveyId: string;           // Required: Survey ID to export
  databaseId?: string;        // Optional: Override default database
}
```

**Response**:

```typescript
{
  success: boolean;
  message: string;
  notionUrl: string; // URL to the Notion page
  notionPageId: string; // Notion page ID
}
```

#### POST `/api/notion/export/analytics`

Export survey analytics to Notion page.

**Request Body**:

```typescript
{
  surveyId: string;           // Required: Survey ID
  parentPageId?: string;      // Optional: Override default parent
}
```

**Response**:

```typescript
{
  success: boolean;
  message: string;
  notionUrl: string;
  notionPageId: string;
}
```

#### POST `/api/notion/export/conversation`

Export a conversation to Notion page.

**Request Body**:

```typescript
{
  conversationId: string;     // Required: Conversation ID
  parentPageId?: string;      // Optional: Override default parent
}
```

**Response**:

```typescript
{
  success: boolean;
  message: string;
  notionUrl: string;
  notionPageId: string;
}
```

---

## Server Actions

Server actions can be imported and used in React Server Components or called from client components.

```typescript
import {
  getNotionIntegrationStatus,
  configureNotionIntegration,
  disconnectNotionIntegration,
  exportSurveyToNotionAction,
  exportAnalyticsToNotionAction,
  exportConversationToNotionAction,
  getNotionExports,
  getSurveyNotionExports,
} from "@/app/actions/notion";
```

### Available Actions

1. **`getNotionIntegrationStatus()`** - Check if user has Notion connected
2. **`configureNotionIntegration(data)`** - Connect Notion workspace
3. **`disconnectNotionIntegration()`** - Disconnect Notion
4. **`exportSurveyToNotionAction(surveyId, databaseId?)`** - Export survey
5. **`exportAnalyticsToNotionAction(surveyId, parentPageId?)`** - Export analytics
6. **`exportConversationToNotionAction(conversationId, parentPageId?)`** - Export conversation
7. **`getNotionExports()`** - Get all user's exports
8. **`getSurveyNotionExports(surveyId)`** - Get exports for specific survey

---

## Database Schema

### notionIntegrations Table

Stores user Notion connection settings.

```typescript
{
  id: string; // Primary key
  userId: string; // Foreign key to users table (unique)
  notionToken: string; // Encrypted Notion API token
  workspaceName: string | null; // Display name for workspace
  parentPageId: string | null; // Default parent page for exports
  surveyDatabaseId: string | null; // Survey database ID
  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes**:

- `notion_integrations_user_id_idx` on `userId`

**Constraints**:

- `userId` is unique (one integration per user)
- Foreign key to `users(id)` with cascade delete

### notionExports Table

Tracks all exports to Notion.

```typescript
{
  id: string; // Primary key
  userId: string; // Foreign key to users table
  surveyId: string | null; // Foreign key to surveys table
  exportType: string; // 'survey' | 'analytics' | 'conversation'
  notionPageId: string; // Notion page/database entry ID
  notionUrl: string | null; // Direct URL to Notion page
  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes**:

- `notion_exports_user_id_idx` on `userId`
- `notion_exports_survey_id_idx` on `surveyId`

**Constraints**:

- Foreign key to `users(id)` with cascade delete
- Foreign key to `surveys(id)` with cascade delete

---

## Usage Examples

### Example 1: Connect Notion Workspace

```typescript
"use client";

import { useState } from "react";
import { configureNotionIntegration } from "@/app/actions/notion";

export function NotionConnectForm() {
  const [token, setToken] = useState("");
  const [pageId, setPageId] = useState("");

  const handleConnect = async () => {
    const result = await configureNotionIntegration({
      notionToken: token,
      parentPageId: pageId,
      workspaceName: "My Workspace",
    });

    if (result.success) {
      alert("Connected to Notion successfully!");
    } else {
      alert(`Error: ${result.error}`);
    }
  };

  return (
    <div>
      <input
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Notion Integration Token"
      />
      <input
        type="text"
        value={pageId}
        onChange={(e) => setPageId(e.target.value)}
        placeholder="Parent Page ID"
      />
      <button onClick={handleConnect}>Connect Notion</button>
    </div>
  );
}
```

### Example 2: Export Survey

```typescript
"use client";

import { exportSurveyToNotionAction } from "@/app/actions/notion";

export function ExportButton({ surveyId }: { surveyId: string }) {
  const handleExport = async () => {
    const result = await exportSurveyToNotionAction(surveyId);

    if (result.success) {
      // Open the Notion page
      window.open(result.notionUrl, "_blank");
    } else {
      alert(`Export failed: ${result.error}`);
    }
  };

  return <button onClick={handleExport}>Export to Notion</button>;
}
```

### Example 3: Check Integration Status

```typescript
import { getNotionIntegrationStatus } from "@/app/actions/notion";

export async function NotionStatusBadge() {
  const status = await getNotionIntegrationStatus();

  if (!status.connected) {
    return <span>Not connected</span>;
  }

  return (
    <div>
      <span>✓ Connected to Notion</span>
      {status.integration?.workspaceName && (
        <span> - {status.integration.workspaceName}</span>
      )}
    </div>
  );
}
```

### Example 4: View Export History

```typescript
import { getNotionExports } from "@/app/actions/notion";

export async function ExportHistory() {
  const { exports } = await getNotionExports();

  return (
    <ul>
      {exports.map((exp) => (
        <li key={exp.id}>
          <a href={exp.notionUrl || "#"} target="_blank">
            {exp.surveyTitle} - {exp.exportType}
          </a>
          <span>{new Date(exp.createdAt).toLocaleDateString()}</span>
        </li>
      ))}
    </ul>
  );
}
```

---

## Error Handling

### Common Errors

1. **Invalid Notion Token**

   ```
   Error: "Invalid Notion token"
   ```

   **Solution**: Verify your integration token is correct and not expired

2. **Missing Parent Page ID**

   ```
   Error: "No parent page ID found"
   ```

   **Solution**: Provide a parent page ID when configuring the integration

3. **Insufficient Permissions**

   ```
   Error: "Failed to export to Notion"
   ```

   **Solution**: Ensure the integration has been shared with the target page

4. **Page Not Found**
   ```
   Error: "Could not find page"
   ```
   **Solution**: Verify the page ID is correct and the integration has access

### Error Response Format

All API endpoints and actions return errors in a consistent format:

```typescript
{
  success: false;
  error: string;  // Human-readable error message
  details?: string; // Additional technical details (when available)
}
```

---

## Best Practices

### Security

1. **Token Storage**: Notion tokens are stored encrypted in the database
2. **User Isolation**: Each user's integration is isolated and cannot access other users' data
3. **Validation**: All inputs are validated before processing
4. **Authentication**: All endpoints require authenticated sessions

### Performance

1. **Async Operations**: All Notion API calls are asynchronous
2. **Error Recovery**: Failed exports can be retried without data loss
3. **Batch Exports**: Consider batching multiple exports to reduce API calls

### Data Management

1. **Export Tracking**: All exports are logged with timestamps
2. **Duplicate Prevention**: Check export history before re-exporting
3. **Cleanup**: Consider implementing periodic cleanup of old export records

### User Experience

1. **Status Feedback**: Always show loading states during exports
2. **Success Confirmation**: Show success messages with links to Notion
3. **Error Messages**: Display clear, actionable error messages
4. **Documentation**: Provide users with setup instructions

---

## Notion Data Structure

### Survey Database Schema

When a survey database is created in Notion, it includes:

| Property   | Type      | Description                                   |
| ---------- | --------- | --------------------------------------------- |
| Name       | Title     | Survey title                                  |
| Status     | Select    | Survey status (draft, creating, active, etc.) |
| Survey ID  | Rich Text | Unique survey identifier                      |
| Created At | Date      | Survey creation date                          |
| Updated At | Date      | Last update date                              |

### Analytics Page Structure

Analytics pages include:

1. **Heading 1**: "Survey Analytics"
2. **Overall Summary**: Text summary of survey results
3. **Key Metrics**: Bulleted list with:
   - Total Conversations
   - Average Conversation Length
4. **Additional Metrics**: JSON code block with detailed metrics

### Conversation Page Structure

Conversation pages include:

1. **Heading 1**: "Survey Conversation"
2. **Metadata**: Conversation ID, status, creation date
3. **Summary**: If available
4. **Messages**: Alternating participant/AI messages with timestamps

---

## Troubleshooting

### Integration Not Connecting

1. Verify your integration token is correct
2. Check that the integration is active in Notion
3. Ensure you have admin access to the workspace

### Exports Failing

1. Verify the parent page still exists
2. Check that the integration has access to the page
3. Review Notion API rate limits (3 requests per second)

### Missing Data in Exports

1. Verify all required data exists in the database
2. Check for data validation errors in server logs
3. Ensure proper permissions on the survey/conversation

---

## Support

For issues or questions about the Notion integration:

1. Check the error messages in the application
2. Review server logs for detailed error information
3. Consult the [Notion API Documentation](https://developers.notion.com)
4. Contact your application administrator

---

## Future Enhancements

Potential improvements to consider:

- [ ] Automatic sync on survey completion
- [ ] Bulk export functionality
- [ ] Custom Notion templates
- [ ] Real-time sync with webhooks
- [ ] Two-way sync (import from Notion)
- [ ] Advanced filtering and views in Notion databases
- [ ] Integration with Notion AI
- [ ] Export scheduling and automation

---

## Changelog

### Version 1.0.0 (December 2025)

- Initial Notion integration release
- Support for survey, analytics, and conversation exports
- Database management and connection handling
- Export history tracking
