import { spawnSync } from "node:child_process";

const testFiles = [
  "features/surveys/tests/survey-response-voice-state.test.ts",
  "features/surveys/tests/survey-creation-controller.test.ts",
  "features/surveys/tests/respondent-runtime-normalization.test.ts",
  "features/surveys/tests/conducting-runtime-regression.test.ts",
  "features/tutoring/tests/quiz-image-guidance.test.ts",
  "features/tutoring/tests/live-session-message-normalization.test.ts",
  "features/tutoring/tests/learning-prompt-runtime.test.ts",
  "features/tutoring/tests/learning-framework-schema.test.ts",
  "features/tutoring/tests/learning-agent-tools.test.ts",
];

let exitCode = 0;
const testEnv = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, "--conditions=react-server"]
    .filter(Boolean)
    .join(" "),
  NODE_ENV: "test" as const,
  DATABASE_URL: "postgresql://test:test@localhost:5432/convy_test",
  BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-for-auth",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  RESEND_API_KEY: "re_test_key",
  RESEND_FROM_EMAIL: "test@example.invalid",
  GOOGLE_GENERATIVE_AI_API_KEY: "test-google-key",
  NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.invalid",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-supabase-key",
  convy_supabase_secret_key: "test-supabase-secret",
};

for (const testFile of testFiles) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", testFile],
    { env: testEnv, stdio: "inherit" },
  );

  if (result.error) {
    console.error(`Could not run ${testFile}:`, result.error);
    exitCode = 1;
  } else if (result.status !== 0) {
    exitCode = result.status ?? 1;
  }
}

process.exitCode = exitCode;
