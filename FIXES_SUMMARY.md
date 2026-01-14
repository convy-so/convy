# 🔧 COMPREHENSIVE FIXES SUMMARY

## ✅ COMPLETED FIXES

### 1. Plan Features Updated ✅
- Updated `lib/billing/plans.ts` with correct plan limits:
  - **Free**: 3 text surveys, 50 participants each, analytics
  - **Pro**: 50 text surveys (100 participants), 10 voice surveys (50 participants, 10 min max), 5 workspaces (5 members each)
  - **Premium**: 100 text surveys (200 participants), 50 voice surveys (100 participants, 30 min max), 10 workspaces (20 members), all integrations
  - **Enterprise**: Unlimited everything

### 2. Database Schema Fixes ✅
- ✅ Added composite index on `subscriptions(userId, status, currentPeriodEnd)`
- ✅ Added unique constraint on `usageTracking(userId, organizationId, periodStart)`
- ✅ Changed `payments.subscriptionId` onDelete from "set null" to "restrict"
- ✅ Fixed import order in `db/schema/organization.ts`
- ✅ Added indexes to `projects` table
- ⚠️ **NOTE**: Money column types (text → numeric) require migration - see below

### 3. Stripe Payment Fixes ✅
- ✅ Fixed idempotency check in `checkout.session.completed` (check BEFORE creating)
- ✅ Fixed race condition in `handleInvoicePaymentSucceeded` (creates subscription if missing)
- ✅ Added amount validation (must match plan price, 1 cent tolerance)
- ✅ Wrapped payment + subscription updates in transaction
- ✅ Fixed refund handler to cancel subscription
- ✅ Added `invoice.payment_failed` handler to update subscription status

### 4. Coinbase Payment Fixes ✅
- ✅ Fixed amount validation (must be exact match or max 1 cent tolerance, not below)
- ✅ Moved idempotency check BEFORE transaction
- ✅ Fixed date calculation bug (handles month-end overflow correctly)
- ✅ Added proration calculation for plan changes
- ✅ Store crypto amount and currency in payments table
- ✅ Fixed timing attack vulnerability in signature verification
- ✅ Added charge expiration check

### 5. Plan Enforcement Fixes ✅
- ✅ Fixed `getActiveSubscriptionForUser` to check `status="active"` and `cancelAtPeriodEnd=false`
- ✅ Added entitlement check functions:
  - `assertCanCreateVoiceSurvey()`
  - `assertCanAddVoiceParticipant()`
  - `assertVoiceDurationAllowed()`
  - `assertCanAddTextParticipant()`
  - `assertCanUseZapier()`
  - `assertCanUseNotion()`
  - `assertCanUseSlack()`
  - `assertCanCreateWorkspace()`
  - `assertCanAddWorkspaceMember()`
- ✅ Fixed `startSurveyCreationAction` to check entitlements with organizationId

---

## 🔴 CRITICAL REMAINING WORK

### 1. Add Entitlement Checks to Feature Entry Points

**Voice Survey Creation:**
- [ ] `websocket/handlers/survey-creation-voice.ts:handleStart()` - Add `assertCanCreateVoiceSurvey()`
- [ ] Check `maxVoiceSurveys` limit before creating

**Voice Survey Response:**
- [ ] `websocket/handlers/survey-response-voice.ts:initialize()` - Add `assertCanAddVoiceParticipant()`
- [ ] Check `maxConcurrentParticipants` before allowing connection
- [ ] Check `maxVoiceMinutesPerSession` during session (monitor duration)

**Text Survey Response:**
- [ ] Add check for `maxTextResponses` when participant joins
- [ ] Use atomic increment for `currentParticipants` counter

**Zapier Integration:**
- [ ] `app/api/zapier/v1/auth/route.ts` - Add `assertCanUseZapier()` check
- [ ] `app/api/zapier/v1/subscribe/route.ts` - Add `assertCanUseZapier()` check

**Notion Integration:**
- [ ] `app/actions/notion.ts:configureNotionIntegration()` - Add `assertCanUseNotion()` check
- [ ] `app/actions/notion.ts:exportSurveyToNotionAction()` - Add `assertCanUseNotion()` check

**Slack Integration:**
- [ ] `app/actions/slack.ts:getSlackIntegrationStatus()` - Add `assertCanUseSlack()` check (optional, can fail gracefully)
- [ ] `app/api/slack/auth/route.ts` - Add `assertCanUseSlack()` check

**Workspace Creation:**
- [ ] Add `assertCanCreateWorkspace()` check before creating workspace
- [ ] Add `assertCanAddWorkspaceMember()` check when inviting members

### 2. Fix AI Context Engineering Issues

**Survey Creation Voice Handler:**
- [ ] `websocket/handlers/survey-creation-voice.ts:initialize()` - Fix survey config building
  - Currently tries to load survey by `conversationId` which is wrong
  - Should build config from conversation goal/extracted data instead
  - Fix: Don't load survey, build config from `surveyCreationConversations.extractedData`

**Context Compression:**
- [ ] `lib/conversation-memory.ts:buildCompressedContext()` - Rebuild `historySummary` on each call
  - Currently computed once and never updated
  - Fix: Call `buildHistorySummary()` every time, don't cache

**Async Memory Updates:**
- [ ] `websocket/handlers/survey-response-voice.ts:generateResponse()` - Fix race condition
  - Currently `updateMemoryAsync()` is NOT awaited
  - Fix: Queue memory updates or use locking mechanism
  - Option 1: Use `await this.updateMemoryAsync(...)`
  - Option 2: Use a queue with sequential processing

### 3. Fix Zapier Integration Issues

**Webhook Delivery:**
- [ ] `lib/zapier/webhook-delivery.ts` - Add retry logic (3 attempts with exponential backoff)
- [ ] Move webhook delivery to background job (BullMQ)
- [ ] Add deduplication (check `deliveryId` before sending)

**Error Format:**
- [ ] Return errors in Zapier's expected format:
  ```json
  {
    "status": "error",
    "message": "Invalid authentication",
    "errors": [{"field": "api_key", "message": "API key is invalid"}]
  }
  ```

**Sample Data:**
- [ ] `app/api/zapier/v1/samples/[trigger]/route.ts` - Add `timestamp` field to samples

**Rate Limiting:**
- [ ] `app/api/zapier/v1/subscribe/route.ts` - Add rate limiting (max 100 subscriptions per integration)

**Authentication:**
- [ ] `app/api/zapier/v1/auth/route.ts` - Generate secure random token instead of using integration ID
- [ ] Store encrypted access token in database
- [ ] Add Bearer token validation in all Zapier endpoints

### 4. Fix Feature Interaction Triggers

**Survey Creation:**
- [ ] `app/actions/survey-creation.ts:finalizeSurveyCreationAction()` - Already has Zapier trigger ✅
- [ ] Add Slack auto-post trigger: `await autoPostSurveyCreated(userId, surveyId)`
- [ ] Check if Slack integration exists and auto-post is enabled

**Conversation Completion:**
- [ ] `app/actions/conversation.ts:completeConversationAction()` - Add Notion sync check
  - Currently triggers Notion sync unconditionally
  - Fix: Check if Notion integration exists and `autoSyncConversations` is enabled

**Analytics Generation:**
- [ ] After analytics are saved, trigger Slack auto-post if enabled
  - Add: `await autoPostAnalyticsUpdate(userId, surveyId)`
  - Check if Slack integration exists and `autoPostAnalytics` is enabled

**Voice Session Completion:**
- [ ] `websocket/handlers/survey-response-voice.ts:cleanup()` - Update usage tracking
  - Track voice minutes used in `usageTracking` table
  - Increment `voiceSurveysCount` or `voiceResponsesCount`

### 5. Database Migration Required

**Money Column Types:**
- [ ] Create migration to change:
  - `billing.totalCost`, `sttCost`, `ttsCost` from `text` to `numeric(10,6)`
  - `voice.totalCost`, `sttCost`, `ttsCost` from `text` to `numeric(10,6)`
- [ ] Backfill existing data (convert text to numeric)

**Foreign Key Constraint:**
- [ ] Add FK constraint on `sessions.activeOrganizationId` → `organizations.id`
- [ ] Requires handling circular dependency (can be done in migration)

### 6. Usage Tracking Implementation

**Currently Missing:**
- [ ] `usageTracking` table is never written to
- [ ] Need to implement:
  - `incrementUsage(userId, feature, count)` function
  - `getUsage(userId, period)` function
  - Track usage in all features:
    - Survey creation → increment `textSurveysCount` or `voiceSurveysCount`
    - Participant joins → increment `textResponsesCount` or `voiceResponsesCount`
    - Voice session ends → track `voiceMinutesUsed` (need to add this field)

**Add Missing Field:**
- [ ] Add `voiceMinutesUsed` integer field to `usageTracking` table

### 7. Race Condition Fixes

**Survey Participants Counter:**
- [ ] `websocket/handlers/survey-response-voice.ts` - Use atomic SQL increment:
  ```typescript
  await db.update(surveys)
    .set({ currentParticipants: sql`current_participants + 1` })
    .where(eq(surveys.id, surveyId));
  ```

**Memory Updates:**
- [ ] Queue memory updates or use locking to prevent concurrent overwrites

---

## 📋 IMPLEMENTATION PRIORITY

### Phase 1: Critical (Do First)
1. Add entitlement checks to voice survey creation/response
2. Fix atomic increment for `currentParticipants`
3. Fix async memory update race condition
4. Add usage tracking implementation

### Phase 2: High Priority
5. Fix AI context engineering issues
6. Add feature interaction triggers (Slack/Notion/Zapier)
7. Fix Zapier authentication and error handling

### Phase 3: Medium Priority
8. Database migrations for money types
9. Add retry logic to Zapier webhooks
10. Move webhooks to background jobs

---

## 🧪 TESTING CHECKLIST

After implementing fixes, test:

- [ ] Free user tries to create 4th text survey → Should be blocked
- [ ] Free user tries to create voice survey → Should be blocked
- [ ] Pro user creates 11th voice survey → Should be blocked
- [ ] Pro user exceeds 10 min voice session → Should be blocked/warned
- [ ] Pro user adds 51st participant to voice survey → Should be blocked
- [ ] Premium user uses Zapier → Should work
- [ ] Free user tries Zapier → Should be blocked
- [ ] Workspace member uses owner's plan features → Should work
- [ ] Payment amount validation → Should reject incorrect amounts
- [ ] Webhook idempotency → Should handle duplicate events
- [ ] Survey creation triggers Slack/Zapier → Should fire webhooks
- [ ] Conversation completion triggers Notion → Should sync if enabled

---

## 📝 NOTES

- Money column type changes require careful migration (text → numeric)
- Some fixes require database migrations - test in dev first
- Entitlement checks should fail gracefully (log errors, don't crash)
- Feature triggers should check if integrations exist before calling
- Usage tracking needs to be implemented from scratch
