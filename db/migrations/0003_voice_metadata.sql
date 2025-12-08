-- Voice feature metadata tables
-- Tracks voice interactions, costs, and quality metrics

-- Voice sessions table to track WebSocket voice interactions
CREATE TABLE IF NOT EXISTS "voice_sessions" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT,
  "survey_id" TEXT,
  "conversation_id" TEXT,
  "session_type" TEXT NOT NULL CHECK (session_type IN ('survey_creation', 'survey_response')),
  "started_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "ended_at" TIMESTAMP WITH TIME ZONE,
  "duration_ms" INTEGER DEFAULT 0,
  "audio_duration_ms" INTEGER DEFAULT 0,
  "total_cost" DECIMAL(10, 6) DEFAULT 0,
  "stt_cost" DECIMAL(10, 6) DEFAULT 0,
  "tts_cost" DECIMAL(10, 6) DEFAULT 0,
  "status" TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned', 'error')),
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE CASCADE
);

-- Voice chunks table to track individual audio processing
CREATE TABLE IF NOT EXISTS "voice_chunks" (
  "id" TEXT PRIMARY KEY,
  "session_id" TEXT NOT NULL,
  "chunk_type" TEXT NOT NULL CHECK (chunk_type IN ('audio_in', 'audio_out')),
  "duration_ms" INTEGER NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "transcription" TEXT,
  "synthesis_text" TEXT,
  "cost" DECIMAL(10, 6) DEFAULT 0,
  "had_speech" BOOLEAN DEFAULT true,
  "vad_probability" DECIMAL(4, 3),
  "processing_time_ms" INTEGER,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Voice quality metrics table
CREATE TABLE IF NOT EXISTS "voice_quality_metrics" (
  "id" TEXT PRIMARY KEY,
  "session_id" TEXT NOT NULL,
  "metric_type" TEXT NOT NULL,
  "metric_value" DECIMAL(10, 4) NOT NULL,
  "timestamp" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  FOREIGN KEY ("session_id") REFERENCES "voice_sessions"("id") ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "voice_sessions_user_id_idx" ON "voice_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "voice_sessions_survey_id_idx" ON "voice_sessions"("survey_id");
CREATE INDEX IF NOT EXISTS "voice_sessions_started_at_idx" ON "voice_sessions"("started_at");
CREATE INDEX IF NOT EXISTS "voice_chunks_session_id_idx" ON "voice_chunks"("session_id");
CREATE INDEX IF NOT EXISTS "voice_quality_metrics_session_id_idx" ON "voice_quality_metrics"("session_id");

-- Add voice-related fields to existing tables
ALTER TABLE "surveys" ADD COLUMN IF NOT EXISTS "voice_enabled" BOOLEAN DEFAULT false;
ALTER TABLE "survey_conversations" ADD COLUMN IF NOT EXISTS "voice_session_id" TEXT;
ALTER TABLE "survey_creation_conversations" ADD COLUMN IF NOT EXISTS "voice_session_id" TEXT;

-- Add foreign keys for voice sessions
ALTER TABLE "survey_conversations" ADD CONSTRAINT IF NOT EXISTS "survey_conversations_voice_session_fk" 
  FOREIGN KEY ("voice_session_id") REFERENCES "voice_sessions"("id") ON DELETE SET NULL;
  
ALTER TABLE "survey_creation_conversations" ADD CONSTRAINT IF NOT EXISTS "survey_creation_conversations_voice_session_fk" 
  FOREIGN KEY ("voice_session_id") REFERENCES "voice_sessions"("id") ON DELETE SET NULL;
