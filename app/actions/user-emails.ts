"use server";

import { db } from "@/db";
import { userEmails, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { sendSecondaryEmailVerification } from "@/lib/email";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function addSecondaryEmail(email: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("Unauthorized");
  }

  // Check if email already exists in users or userEmails
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existingUser) {
    throw new Error("Email already in use by another account");
  }

  const existingEmail = await db.query.userEmails.findFirst({
    where: eq(userEmails.email, email),
  });
  if (existingEmail) {
    throw new Error("Email already added to an account");
  }

  const token = nanoid(32);
  const [newEmail] = await db
    .insert(userEmails)
    .values({
      id: nanoid(),
      userId: session.user.id,
      email,
      verificationToken: token,
      emailVerified: false,
    })
    .returning();

  await sendSecondaryEmailVerification({
    email: newEmail.email,
    url: `${env.BETTER_AUTH_URL}/settings/profile/verify-email?token=${token}`,
    name: session.user.name,
  });

  return newEmail;
}

export async function verifySecondaryEmail(token: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  
  // Find email by token
  const emailRecord = await db.query.userEmails.findFirst({
    where: eq(userEmails.verificationToken, token),
  });

  if (!emailRecord) {
    return { error: "Invalid token" };
  }

  await db
    .update(userEmails)
    .set({
      emailVerified: true,
      verificationToken: null,
    })
    .where(eq(userEmails.id, emailRecord.id));

  return { success: true, email: emailRecord.email };
}

export async function removeSecondaryEmail(emailId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("Unauthorized");
  }

  // Ensure belongs to user
  const emailRecord = await db.query.userEmails.findFirst({
    where: eq(userEmails.id, emailId),
  });

  if (!emailRecord || emailRecord.userId !== session.user.id) {
    throw new Error("Email not found");
  }

  await db.delete(userEmails).where(eq(userEmails.id, emailId));
  return { success: true };
}

export async function setPrimaryEmail(emailId: string) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      throw new Error("Unauthorized");
    }

    const secondary = await db.query.userEmails.findFirst({
        where: eq(userEmails.id, emailId)
    });

    if (!secondary || secondary.userId !== session.user.id || !secondary.emailVerified) {
        throw new Error("Email not found or not verified");
    }

    const currentPrimaryEmail = session.user.email;
    
    // Transactional swap
    await db.transaction(async (tx) => {
        // Update user primary
        await tx.update(users).set({ 
            email: secondary.email,
            emailVerified: true 
        }).where(eq(users.id, session.user.id));
        
        // Update secondary to old primary
        await tx.update(userEmails).set({
            email: currentPrimaryEmail,
            emailVerified: true // Assuming it was verified
        }).where(eq(userEmails.id, secondary.id));
    });
    
    return { success: true };
}

export async function getUserEmails() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return [];
    
    return await db.query.userEmails.findMany({
        where: eq(userEmails.userId, session.user.id)
    });
}
