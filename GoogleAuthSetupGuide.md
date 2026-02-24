# Google Authentication Setup Guide

To enable "Sign in with Google" for Convy, follow these steps to configure your Google Cloud Console and set up the required environment variables.

## 1. Google Cloud Console Setup

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a new project (e.g., "Convy").
3.  Navigate to **APIs & Services** > **OAuth consent screen**.
    - Choose **External**.
    - Fill in the required App information (App name, support email, developer contact).
    - Add the `.../auth/userinfo.email` and `.../auth/userinfo.profile` scopes.
4.  Navigate to **APIs & Services** > **Credentials**.
    - Click **Create Credentials** > **OAuth client ID**.
    - Select **Web application** as the Application type.
    - Add **Authorized JavaScript origins**:
      - `http://localhost:3000` (for development)
      - `https://yourdomain.com` (for production)
    - Add **Authorized redirect URIs**:
      - `http://localhost:3000/api/auth/callback/google`
      - `https://yourdomain.com/api/auth/callback/google`
5.  Copy your **Client ID** and **Client Secret**.

## 2. Environment Variables

Add the following variables to your `.env` file:

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

## 3. Better Auth Configuration

Ensure your `BETTER_AUTH_URL` in `.env` matches your application's public URL (or `http://localhost:3000` for local dev).

---

## Technical Details

- **Provider ID**: `google`
- **Scopes**: `email`, `profile` (requested by default)
- **Prompt**: `consent` (configured in `lib/auth.ts` to ensure users can switch accounts if needed)
