# AI-Powered Survey Application - Implementation Documentation

## Overview

This document explains the server-side implementation of the AI-powered survey application. The system allows survey makers to create AI-driven conversational surveys, review sample conversations, and analyze results with AI-generated insights.

## Architecture

### Technology Stack
- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: Vercel AI SDK with Google Gemini 2.0 Flash
- **Authentication**: Better Auth
- **Language**: TypeScript

### Key Design Principles
1. **Server-Side Only**: All AI processing and data management happens on the server
2. **Streaming Responses**: Real-time conversation streaming using Vercel AI SDK
3. **Type Safety**: Full TypeScript with Zod validation
4. **Modular Structure**: Separated concerns with clear file organization
5. **Cost Optimization**: Participant limits and efficient AI model usage

## File Structure

```
app/
├── actions/                    # Server actions (Next.js server functions)
│   ├── auth.ts                # Authentication actions (existing)
│   ├── survey.ts              # Survey CRUD operations
│   ├── sample-conversation.ts  # Sample conversation generation & feedback
│   ├── conversation.ts        # Conversation storage & insight generation
│   ├── analytics.ts           # Analytics generation & retrieval
│   └── survey-public.ts       # Public survey access (no auth)
│
├── api/                        # API routes for streaming
│   └── surveys/
│       └── [surveyId]/
│           ├── chat/route.ts   # Streaming chat for participants
│           └── sample/route.ts # Streaming sample conversations
│
db/
├── schema.ts                   # Database schema (extended with survey tables)
└── index.ts                    # Database connection

lib/
├── ai.ts                       # AI model configuration (Gemini 2.0 Flash)
├── prompts.ts                  # AI prompt templates
├── env.ts                      # Environment variables
└── auth/                       # Auth utilities (existing)
```

## Database Schema

### Core Tables

1. **surveys**
   - Stores survey definitions (goal, type, required questions, metrics)
   - Tracks status: `draft` → `sample_review` → `active` → `completed`
   - Includes participant limits and shareable links

2. **sample_conversations**
   - Stores up to 3 sample conversations for survey maker review
   - Includes feedback and confirmation status
   - Used to refine the AI's conversation style

3. **survey_conversations**
   - Stores actual conversations between AI and participants
   - Contains raw conversation data (messages with timestamps)
   - Tracks completion status

4. **conversation_insights**
   - AI-generated insights per conversation
   - Structured insights and key findings
   - Generated after conversation completion

5. **survey_analytics**
   - Overall analytics aggregated from all conversations
   - AI-generated summary and metrics
   - Updated when new conversations complete

## Implementation Details

### 1. Survey Creation Flow

**File**: `app/actions/survey.ts`

```typescript
createSurveyAction() → Creates survey in "draft" status
updateSurveyAction() → Updates survey (only in draft/sample_review)
confirmSurveyAction() → Activates survey (draft → active)
```

**Process**:
1. Survey maker creates survey with goal, type, information, required questions, metrics
2. Survey is created with unique shareable link
3. Status starts as `draft`

### 2. Sample Conversation Generation

**File**: `app/actions/sample-conversation.ts`

**Process**:
1. Survey maker requests sample conversation (max 3)
2. AI generates conversation using survey config + any feedback
3. Conversation is saved and survey status → `sample_review`
4. Survey maker can:
   - Provide feedback on what's missing/needs improvement
   - Confirm the conversation
5. After all sample conversations are confirmed → survey can be activated

**Key Features**:
- Iterative refinement (up to 3 iterations)
- Feedback incorporation
- JSON-structured conversation parsing

### 3. Survey Taking (Participant Flow)

**File**: `app/api/surveys/[surveyId]/chat/route.ts`

**Process**:
1. Participant accesses survey via shareable link
2. System checks:
   - Survey is `active`
   - Participant limit not exceeded
3. Streaming conversation via Vercel AI SDK
4. Messages saved in real-time
5. Conversation marked complete when finished

**Streaming**:
- Uses `streamText()` from Vercel AI SDK
- Returns `DataStreamResponse` for real-time updates
- Conversation ID tracked in response headers

### 4. Insight Generation

**File**: `app/actions/conversation.ts`

**Process**:
1. After conversation completes → `completeConversationAction()`
2. AI generates:
   - **Summary**: Brief overview of conversation
   - **Insights**: Structured data (answers to required questions, metrics)
   - **Key Findings**: Notable patterns or concerns
3. Data stored in `conversation_insights` table

**AI Models Used**:
- **Conversations**: Gemini 2.0 Flash (fast, cost-effective)
- **Analysis**: Gemini 2.0 Flash (same model, optimized prompts)

### 5. Analytics Generation

**File**: `app/actions/analytics.ts`

**Process**:
1. Aggregates all completed conversations
2. AI generates:
   - Overall summary
   - Aggregated metrics
   - Common patterns and trends
   - Answers to required questions across all participants
3. Calculates statistics (total conversations, average length)
4. Stores in `survey_analytics` table

### 6. Dashboard Data

**File**: `app/actions/analytics.ts` → `getDashboardDataAction()`

**Returns**:
- Survey metadata
- Analytics (if generated)
- Conversation counts
- Completion statistics

## AI Configuration

### Model Setup
**File**: `lib/ai.ts`

- **Provider**: Google Gemini 2.0 Flash (`@ai-sdk/google`)
- **Model**: `gemini-2.0-flash-exp`
- **Configuration**: 
  - Temperature: 0.7-0.8 (conversations), 0.5 (analysis)
  - Max tokens: 2000-3000 depending on task

### Prompt Engineering
**File**: `lib/prompts.ts`

**Key Prompts**:
1. **Sample Conversation**: Includes survey config + feedback
2. **Survey Conversation**: System prompt for actual interviews
3. **Summary Generation**: Extracts key information
4. **Insights Extraction**: Structured data extraction
5. **Overall Analytics**: Aggregated analysis

**Design Principles**:
- Clear instructions for natural conversation
- Emphasis on covering required questions organically
- Feedback incorporation for iterative improvement

## API Endpoints

### Streaming Endpoints

1. **POST `/api/surveys/[surveyId]/chat`**
   - Streams AI responses for participants
   - Accepts: `{ messages, conversationId? }`
   - Returns: Streaming response with conversation ID header

2. **PUT `/api/surveys/[surveyId]/chat`**
   - Saves conversation messages
   - Accepts: `{ conversationId, messages, completed }`

3. **POST `/api/surveys/[surveyId]/sample`**
   - Streams sample conversations for survey maker
   - Requires authentication
   - Accepts: `{ messages, feedback?, conversationNumber? }`

## Server Actions

### Survey Management
- `createSurveyAction()` - Create new survey
- `updateSurveyAction()` - Update survey details
- `getSurveysAction()` - List user's surveys
- `getSurveyAction()` - Get single survey
- `confirmSurveyAction()` - Activate survey

### Sample Conversations
- `generateSampleConversationAction()` - Generate sample (max 3)
- `provideSampleConversationFeedbackAction()` - Submit feedback
- `confirmSampleConversationAction()` - Approve sample
- `getSampleConversationsAction()` - List all samples

### Conversations
- `completeConversationAction()` - Mark conversation done + generate insights
- `generateConversationInsightsAction()` - Generate insights for conversation
- `getSurveyConversationsAction()` - List all conversations for survey
- `getConversationAction()` - Get single conversation with insights

### Analytics
- `generateSurveyAnalyticsAction()` - Generate overall analytics
- `getSurveyAnalyticsAction()` - Get analytics
- `getDashboardDataAction()` - Get all dashboard data

### Public
- `getSurveyByLinkAction()` - Get survey by shareable link (no auth)

## Data Flow

### Survey Creation → Activation
```
1. createSurveyAction() → draft
2. generateSampleConversationAction() → sample_review (1st sample)
3. provideSampleConversationFeedbackAction() → feedback saved
4. generateSampleConversationAction() → sample_review (2nd sample, with feedback)
5. confirmSampleConversationAction() → all confirmed
6. confirmSurveyAction() → active
```

### Participant Flow
```
1. getSurveyByLinkAction() → verify survey active
2. POST /api/surveys/[id]/chat → stream conversation
3. PUT /api/surveys/[id]/chat → save messages
4. completeConversationAction() → generate insights
```

### Analytics Flow
```
1. Multiple conversations complete
2. generateSurveyAnalyticsAction() → aggregate all
3. AI generates overall summary + metrics
4. Stored in survey_analytics
5. getDashboardDataAction() → display to survey maker
```

## Security & Validation

1. **Authentication**: All survey management requires verified session
2. **Authorization**: Users can only access their own surveys
3. **Public Access**: Shareable links allow public survey access (with limits)
4. **Input Validation**: Zod schemas for all inputs
5. **Participant Limits**: Enforced to control costs

## Error Handling

- Consistent `ActionResult<T>` pattern
- Proper error messages for different scenarios
- Type-safe error handling with Zod
- Graceful fallbacks for AI parsing

## Environment Variables

Required in `.env`:
```bash
DATABASE_URL=...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
RESEND_API_KEY=...
EMAIL_FROM=...
GOOGLE_GENERATIVE_AI_API_KEY=...  # New: For Gemini API
```

## Next Steps for UI Integration

1. **Survey Creation Form**: Call `createSurveyAction()`
2. **Sample Conversation UI**: 
   - Call `generateSampleConversationAction()`
   - Display conversation
   - Collect feedback → `provideSampleConversationFeedbackAction()`
   - Confirm → `confirmSampleConversationAction()`
3. **Survey Activation**: Call `confirmSurveyAction()`
4. **Participant Chat**: 
   - Use `/api/surveys/[id]/chat` with `useChat` hook from `@ai-sdk/react`
5. **Dashboard**: 
   - Call `getDashboardDataAction()`
   - Display analytics, conversations, insights

## Performance Considerations

1. **Streaming**: Real-time responses reduce perceived latency
2. **Participant Limits**: Prevent cost overruns
3. **Efficient AI Usage**: 
   - Gemini 2.0 Flash for cost-effectiveness
   - Appropriate token limits
   - Temperature tuning for quality vs. creativity
4. **Database Indexing**: Indexes on foreign keys and frequently queried fields
5. **Async Processing**: Insight generation can be moved to background jobs (future)

## Future Enhancements

1. **Background Jobs**: Queue insight/analytics generation
2. **Caching**: Cache analytics for frequently accessed surveys
3. **Structured Output**: Use AI SDK structured output for better parsing
4. **Rate Limiting**: Add rate limits to API endpoints
5. **Webhooks**: Notify survey makers of new conversations
6. **Export**: CSV/JSON export of conversations and analytics

