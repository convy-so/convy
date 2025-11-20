"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/lib/auth";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const signUpSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters long")
    .max(32, "Username must be at most 32 characters long"),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  rememberMe: z.boolean().optional().default(false),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  rememberMe: z.boolean().optional().default(false),
});

const googleSchema = z.object({
  callbackURL: z.string().url().optional(),
  newUserCallbackURL: z.string().url().optional(),
  errorCallbackURL: z.string().url().optional(),
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

const forwardHeaders = () => new Headers(headers());

export async function emailSignUpAction(
  input: z.infer<typeof signUpSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof auth.api.signUpEmail>>>> {
  const body = signUpSchema.parse(input);

  try {
    const result = await auth.api.signUpEmail({
      body,
      headers: forwardHeaders(),
    });

    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function emailSignInAction(
  input: z.infer<typeof signInSchema>,
): Promise<ActionResult<Awaited<ReturnType<typeof auth.api.signInEmail>>>> {
  const body = signInSchema.parse(input);

  try {
    const result = await auth.api.signInEmail({
      body,
      headers: forwardHeaders(),
    });

    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function googleSignInAction(
  input: z.infer<typeof googleSchema> = {},
): Promise<
  ActionResult<{
    url: string;
  }>
> {
  const body = googleSchema.parse(input);

  try {
    const result = await auth.api.signInSocial({
      body: {
        provider: "google",
        disableRedirect: true,
        ...body,
      },
      headers: forwardHeaders(),
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
    const result = await auth.api.signOut({
      headers: forwardHeaders(),
    });

    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resendVerificationEmailAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof auth.api.sendVerificationEmail>>>
> {
  try {
    const result = await auth.api.sendVerificationEmail({
      headers: forwardHeaders(),
    });

    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

