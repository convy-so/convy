# Workspace Feature Implementation

This document explains the workspace feature implementation using Better Auth's organization plugin.

## Overview

The workspace feature allows users to:
- Create workspaces (organizations)
- Invite unlimited members to workspaces
- Manage workspace members (add/remove)
- Switch between workspaces
- Associate surveys with workspaces

## Implementation Details

### 1. Better Auth Configuration

**File: `lib/auth.ts`**

- Added `organization` plugin from `better-auth/plugins`
- Configured with:
  - Unlimited membership limit (`membershipLimit: Infinity`)
  - Unlimited invitations (`invitationLimit: Infinity`)
  - Creator gets `owner` role
  - Custom invitation email handler

### 2. Database Schema

**File: `db/schema.ts`**

Added the following tables (managed by Better Auth):
- `organization` - Stores workspace information
- `member` - Links users to organizations with roles
- `invitation` - Manages workspace invitations

Updated tables:
- `sessions` - Added `activeOrganizationId` and `activeTeamId` fields
- `surveys` - Added `organizationId` field to associate surveys with workspaces

### 3. Email Integration

**Files: `lib/email.ts`, `workers/email.worker.ts`, `lib/queue.ts`**

- Added `sendWorkspaceInvitationEmail` function
- Updated email worker to handle workspace invitation emails
- Updated email queue type to include `workspace-invitation`

### 4. Server Actions

**File: `app/actions/workspace.ts`**

Created comprehensive server actions for workspace management:
- `createWorkspace` - Create a new workspace
- `getUserWorkspaces` - List all workspaces for current user
- `getActiveWorkspace` - Get currently active workspace
- `setActiveWorkspace` - Switch active workspace
- `inviteToWorkspace` - Invite a user to workspace
- `removeWorkspaceMember` - Remove a member from workspace
- `getWorkspaceMembers` - List workspace members
- `updateWorkspace` - Update workspace details
- `leaveWorkspace` - Leave a workspace
- `deleteWorkspace` - Delete a workspace (owner only)

### 5. Client Configuration

**File: `lib/auth-client.ts`**

- Created Better Auth client with `organizationClient` plugin
- Enables client-side workspace management

### 6. UI Components

**Files:**
- `app/workspace/page.tsx` - Main workspace management page
- `app/workspace/accept-invitation/[invitationId]/page.tsx` - Invitation acceptance page

### 7. Survey Integration

**File: `app/actions/survey-creation.ts`**

- Updated `startSurveyCreationAction` to automatically associate new surveys with active workspace
- Surveys created while a workspace is active will belong to that workspace

## Roles

The implementation uses two basic roles:
- **owner** - The user who created the workspace. Can:
  - Add/remove members
  - Delete workspace
  - Update workspace settings
- **member** - Regular users. Can:
  - Use all app features normally
  - Leave workspace
  - Cannot manage members or delete workspace

## Database Migration

To set up the workspace feature, you need to run Better Auth migrations:

```bash
npx @better-auth/cli migrate
```

This will create the necessary tables:
- `organization`
- `member`
- `invitation`

And update the `session` table to include `activeOrganizationId` and `activeTeamId` fields.

## Environment Variables

No new environment variables are required. The existing `BETTER_AUTH_URL` is used.

Optional: You can set `NEXT_PUBLIC_BETTER_AUTH_URL` if your frontend needs a different base URL.

## Usage

### Creating a Workspace

Users can create workspaces from `/workspace` page. They need to provide:
- Workspace name
- Slug (URL-friendly identifier)

### Inviting Members

Workspace owners can invite members by email. The invited user will receive an email with a link to accept the invitation.

### Switching Workspaces

Users can switch between workspaces from the workspace management page. The active workspace is stored in the session.

### Survey Association

When a user creates a survey while a workspace is active, the survey is automatically associated with that workspace. Surveys can still be created without a workspace (personal surveys).

## API Endpoints

Better Auth provides the following organization endpoints:
- `POST /api/auth/organization/create` - Create organization
- `GET /api/auth/organization/list` - List organizations
- `POST /api/auth/organization/set-active` - Set active organization
- `POST /api/auth/organization/invite-member` - Invite member
- `POST /api/auth/organization/accept-invitation` - Accept invitation
- `POST /api/auth/organization/remove-member` - Remove member
- `GET /api/auth/organization/list-members` - List members
- `POST /api/auth/organization/update` - Update organization
- `POST /api/auth/organization/delete` - Delete organization
- `POST /api/auth/organization/leave` - Leave organization

## Security Considerations

1. **Authorization**: All workspace operations check user permissions
2. **Role-based Access**: Only owners can manage members and delete workspaces
3. **Invitation Expiry**: Invitations expire after 48 hours (configurable)
4. **Email Verification**: Users must verify their email before accepting invitations (if enabled)

## Future Enhancements (Implemented)

### Data Sharing & Access Control
- **Workspace-Wide Visibility**: Surveys, analytics, and insights are now automatically shared with all workspace members.
- **Role-Based Permissions**: 
  - **Owners**: Full access (Create, Edit, Delete, Share).
  - **Members**: View-only access to surveys and analytics.
- **Implementation**: Access control logic is centralized in `lib/workspace-access.ts` and applied across all server actions.

### Project Organization (Folders)
- **Projects**: Surveys can now be organized into projects (folders).
- **Structure**: Projects act as containers within a workspace or personal account.
- **Database**: New `projects` table and `projectId` on surveys.

### Integration Security
- **Owner-Scoped Integrations**: Integrations (Notion, Slack, Zapier) are tightly scoped to the workspace owner.
- **Inheritance**: Workspace members can *use* these integrations (e.g., trigger a sync, auto-post) but cannot *manage* or *connect* them.
- **Enforcement**: strict ownership checks in `notion-oauth.ts`, `zapier.ts`, and `slack.ts`.

### Workspace Billing
- **Plan Inheritance**: Billing is tied to the workspace user. Members inherit the plan limits and features of the workspace owner.
- **Management**: Only the workspace owner can access the billing portal or make purchases.
- **Entitlements**: The `assertCanCreate...` checks now aggregate usage across the entire workspace to enforce plan limits correctly.
