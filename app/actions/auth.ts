"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/lib/auth";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const emailSchema = z.string().email("Please provide a valid email address");

const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter")
  .regex(/[0-9]/, "Password must include at least one number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must include at least one special character"
  );

const signUpSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters long")
    .max(32, "Username must be at most 32 characters long"),
  email: emailSchema,
  password: strongPasswordSchema,
  rememberMe: z.boolean().optional().default(false),
});

const signInSchema = z.object({
  email: emailSchema,
  password: strongPasswordSchema,
  rememberMe: z.boolean().optional().default(false),
});

const redirectToSchema = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      // Absolute URLs are valid
      new URL(value);
      return true;
    } catch {
      return value.startsWith("/");
    }
  }, "Redirect URL must be absolute or start with /");

const requestPasswordResetSchema = z.object({
  email: emailSchema,
  redirectTo: redirectToSchema.optional(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: strongPasswordSchema,
});

const googleSchema = z.object({
  callbackURL: z.string().url().optional(),
  newUserCallbackURL: z.string().url().optional(),
  errorCallbackURL: z.string().url().optional(),
});

const resendVerificationSchema = z.object({
  email: emailSchema,
  callbackURL: redirectToSchema.optional(),
});

const toActionError = (error: unknown): ActionResult<never> => {
  if (error instanceof APIError) {
    return { success: false, error: error.message };
  }

  if (error instanceof Error) {
    return { success: false, error: error.message };
  }

  return { success: false, error: "Something went wrong" };
};

const forwardHeaders = async () => new Headers(await headers());

export async function emailSignUpAction(
  input: z.infer<typeof signUpSchema>
): Promise<ActionResult<Awaited<ReturnType<typeof auth.api.signUpEmail>>>> {
  const body = signUpSchema.parse(input);

  try {
    const headersInit = await forwardHeaders();
    const result = await auth.api.signUpEmail({
      body,
      headers: headersInit,
    });

    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function emailSignInAction(
  input: z.infer<typeof signInSchema>
): Promise<ActionResult<Awaited<ReturnType<typeof auth.api.signInEmail>>>> {
  const body = signInSchema.parse(input);

  try {
    const headersInit = await forwardHeaders();
    const result = await auth.api.signInEmail({
      body,
      headers: headersInit,
    });

    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function googleSignInAction(
  input: z.infer<typeof googleSchema> = {}
): Promise<
  ActionResult<{
    url: string;
  }>
> {
  const body = googleSchema.parse(input);

  try {
    const headersInit = await forwardHeaders();
    const result = await auth.api.signInSocial({
      body: {
        provider: "google",
        disableRedirect: true,
        ...body,
      },
      headers: headersInit,
    });

    if ("url" in result && result.url) {
      return { success: true, data: { url: result.url } };
    }

    return {
      success: true,
      data: {
        url: body.callbackURL ?? "/",
      },
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function signOutAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof auth.api.signOut>>>
> {
  try {
    const headersInit = await forwardHeaders();
    const result = await auth.api.signOut({
      headers: headersInit,
    });

    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resendVerificationEmailAction(
  input: z.infer<typeof resendVerificationSchema>
): Promise<
  ActionResult<Awaited<ReturnType<typeof auth.api.sendVerificationEmail>>>
> {
  const body = resendVerificationSchema.parse(input);

  try {
    const headersInit = await forwardHeaders();
    const result = await auth.api.sendVerificationEmail({
      body: {
        email: body.email,
        callbackURL: body.callbackURL ?? "/",
      },
      headers: headersInit,
    });

    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function requestPasswordResetAction(
  input: z.infer<typeof requestPasswordResetSchema>
): Promise<
  ActionResult<Awaited<ReturnType<typeof auth.api.requestPasswordReset>>>
> {
  const body = requestPasswordResetSchema.parse(input);

  try {
    const headersInit = await forwardHeaders();
    const result = await auth.api.requestPasswordReset({
      body: {
        email: body.email,
        redirectTo: body.redirectTo ?? "/reset-password",
      },
      headers: headersInit,
    });

    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resetPasswordAction(
  input: z.infer<typeof resetPasswordSchema>
): Promise<ActionResult<Awaited<ReturnType<typeof auth.api.resetPassword>>>> {
  const body = resetPasswordSchema.parse(input);

  try {
    const headersInit = await forwardHeaders();
    const result = await auth.api.resetPassword({
      body: {
        newPassword: body.newPassword,
        token: body.token,
      },
      headers: headersInit,
    });

    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}
