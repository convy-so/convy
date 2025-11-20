## Authentication & Authorization

The project now uses [Better Auth](https://better-auth.com) with the Drizzle adapter on PostgreSQL. Users can:

- Sign up with username + email + password. A verification link is emailed via Resend and they cannot sign in until the email is confirmed.
- Sign in with email/password or with Google OAuth.
- Stay signed out of protected areas until `emailVerified` is true. Use the helpers in `lib/auth/session.ts` to gate any server component, route handler or server action.

### Project structure

| File | Purpose |
| --- | --- |
| `db/schema.ts` | Drizzle models consumed by Better Auth. Includes unique usernames, roles, accounts, sessions, verification tokens. |
| `db/index.ts` | Node Postgres pool + Drizzle client singleton. |
| `lib/auth.ts` | Better Auth initialization (email/password + Google + verification rules + Next.js cookies). |
| `lib/email.ts` | Resend integration used by Better Auth to deliver verification emails. |
| `lib/auth/session.ts` | Cached helpers to get the current session or require a verified user. |
| `app/actions/auth.ts` | Server actions that the UI can call for sign-up, sign-in, Google OAuth, resend verification, and sign-out. |
| `app/api/auth/[...better-auth]/route.ts` | RSC-compatible API route that proxies Better Auth’s HTTP handler. |

## Setup

1. Copy the sample env file and fill it in:
   ```bash
   cp env.sample .env.local
   ```
   Required variables:
   - `DATABASE_URL` – PostgreSQL connection string.
   - `BETTER_AUTH_SECRET` – long random string used for encryption/cookies.
   - `BETTER_AUTH_URL` – public HTTPS origin (used when generating email links).
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` – from the Google Cloud OAuth consent screen.
   - `RESEND_API_KEY`, `EMAIL_FROM` – credentials for sending emails.

2. Generate SQL from the Drizzle schema and run it against your database:
   ```bash
   pnpm drizzle-kit generate
   pnpm drizzle-kit push
   ```

3. Start the dev server:
   ```bash
   pnpm dev
   ```

## Using the server actions

All auth interactions happen on the server via Next.js server actions in `app/actions/auth.ts`:

- `emailSignUpAction({ name, username, email, password, rememberMe? })`
- `emailSignInAction({ email, password, rememberMe? })`
- `googleSignInAction({ callbackURL?, newUserCallbackURL?, errorCallbackURL? })`
- `signOutAction()`
- `resendVerificationEmailAction()`

Each action returns `{ success: boolean, data?: unknown, error?: string }` so the UI can branch without throwing. The UI layer should call these actions, then update routing/UI state.

## Protecting routes/features

- Use `getCurrentSession()` for optional hydration-free session access in server components.
- Use `getVerifiedSession()` to crash early (and surface a 500 or custom error boundary) when an unverified user accesses protected server code. Your UI teammate can wrap this helper to render friendly messaging or redirect elsewhere.

## Testing checklist

- Email password sign-up sends verification (check Resend dashboard or console).
- Attempting to sign in before verification should fail with `EMAIL_NOT_VERIFIED`.
- Google sign-in flow redirects to Google and returns with the session cookie set.
- Hitting the verification link signs the user in automatically (per `autoSignInAfterVerification: true`).

For automated coverage, stub Better Auth by calling the server actions directly and asserting on their JSON responses. Need to test UI flows manually once the frontend is ready.
