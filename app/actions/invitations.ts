"use server";

import { db } from "@/db";
import { users, userEmails, members, invitations, organizations } from "@/db/schema";
import { auth } from "@/lib/auth";
import { sendWorkspaceInvitationEmail, sendWorkspaceWelcomeEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { addSecondaryEmail } from "./user-emails";

export async function inviteMember(email: string, role: "admin" | "member" | "owner", workspaceId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  // Permission check
  const membership = await db.query.members.findFirst({
    where: and(
      eq(members.userId, session.user.id),
      eq(members.organizationId, workspaceId)
    ),
  });

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new Error("You do not have permission to invite members");
  }

  const workspace = await db.query.organizations.findFirst({
    where: eq(organizations.id, workspaceId),
  });
  if (!workspace) throw new Error("Workspace not found");

  // 1. Check if user exists (primary)
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  let targetUserId = existingUser?.id;

  // 2. Check secondary
  if (!targetUserId) {
    const existingSecondary = await db.query.userEmails.findFirst({
      where: eq(userEmails.email, email),
    });
    targetUserId = existingSecondary?.userId;
  }

  if (targetUserId) {
    // Direct Add
    const existingMember = await db.query.members.findFirst({
      where: and(eq(members.userId, targetUserId), eq(members.organizationId, workspaceId)),
    });

    if (existingMember) {
      return { message: "User is already a member" };
    }

    await db.insert(members).values({
      id: nanoid(),
      userId: targetUserId,
      organizationId: workspaceId,
      role,
      createdAt: new Date(),
    });

    // Send Welcome Email
    await sendWorkspaceWelcomeEmail({
      email,
      workspaceName: workspace.name,
      url: `${env.BETTER_AUTH_URL}/workspace/${workspace.slug}`,
    });

    return { success: true, method: "direct_add" };
  } else {
    // Check if invitation exists
    const existingInvite = await db.query.invitations.findFirst({
      where: and(
        eq(invitations.email, email),
        eq(invitations.organizationId, workspaceId)
      ),
    });

    if (existingInvite) {
      // Update expiration and resend
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await db
        .update(invitations)
        .set({
          expiresAt,
          status: "pending",
          role, // update role if changed
        })
        .where(eq(invitations.id, existingInvite.id));

      const inviteLink = `${env.BETTER_AUTH_URL}/workspace/accept-invitation/${existingInvite.id}`;
      
      await sendWorkspaceInvitationEmail({
          email,
          invitedBy: session.user.name || session.user.email,
          workspaceName: workspace.name,
          inviteLink
      });
      
    } else {
      // Create new via Better Auth
      await auth.api.createInvitation({
        headers: await headers(),
        body: {
          email,
          role,
          organizationId: workspaceId,
        },
      });
    }

    return { success: true, method: "invitation" };
  }
}

export async function acceptInvitationWithResolution(invitationId: string, resolution: "add_email" | "merge" | "reject") {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) throw new Error("Unauthorized");

    const invite = await db.query.invitations.findFirst({
        where: eq(invitations.id, invitationId)
    });
    if (!invite) throw new Error("Invitation not found");

    if (invite.status !== "pending") throw new Error("Invitation is not pending");
    if (invite.expiresAt < new Date()) throw new Error("Invitation expired");

    const inviteEmail = invite.email;
    const userEmail = session.user.email;

    if (inviteEmail === userEmail) {
        // Normal accept
        await auth.api.acceptInvitation({
            headers: await headers(),
            body: {
                invitationId
            }
        });
        return { success: true };
    }

    // Mismatch Resolution
    if (resolution === "reject") {
        await auth.api.rejectInvitation({
             headers: await headers(),
             body: { invitationId }
        });
        return { success: true, action: "rejected" };
    }

    if (resolution === "add_email") {
        // Add email as secondary and verify
        // We reuse logic but might need to bypass some checks or handle silently?
        // Call addSecondaryEmail logic directly or via internal func
        // But addSecondaryEmail throws if exists. user likely doesn't have it yet if they are resolving.
        
        // Add to user_emails
        try {
            await addSecondaryEmail(inviteEmail);
        } catch (e: any) {
            // Should ignore "already added to an account" if it's THIS account?
            // If another account has it, we have a problem -> Merge?
            // Use case: User invited at A, signed up with B. A is free.
            if (e.message !== "Email already added to an account") {
               // If it IS added, we should check if it belongs to current user?
               const existing = await db.query.userEmails.findFirst({ where: eq(userEmails.email, inviteEmail) });
               if (existing && existing.userId !== session.user.id) throw new Error("Email belongs to another account");
            }
        }

        // Now direct add to workspace
        await db.insert(members).values({
            id: nanoid(),
            userId: session.user.id,
            organizationId: invite.organizationId,
            role: invite.role,
            createdAt: new Date()
        });

        // Delete invitation
        await db.update(invitations).set({ status: 'accepted' }).where(eq(invitations.id, invitationId));
        // Or delete? Better Auth usually updates status
        
        return { success: true, action: "added_email" };
    }
}

export async function revokeInvitation(invitationId: string) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) throw new Error("Unauthorized");
    
    // Check permission
    const invite = await db.query.invitations.findFirst({ where: eq(invitations.id, invitationId) });
    if (!invite) throw new Error("Invitation not found");

    const membership = await db.query.members.findFirst({
        where: and(
            eq(members.userId, session.user.id),
            eq(members.organizationId, invite.organizationId)
        )
    })
     if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        throw new Error("You do not have permission");
    }

    await auth.api.cancelInvitation({
        headers: await headers(),
        body: { invitationId }
    })
    
    return { success: true };
}

export async function getInvitation(id: string) {
    // Public? Or only logged in?
    // User needs to see the invite to accept it.
    // If not logged in, valid.
    const invite = await db.query.invitations.findFirst({
        where: eq(invitations.id, id),
        with: {
            organization: true,
            inviter: true
        }
    });
    return invite;
}

export async function getPendingInvitations(workspaceId: string) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return [];

    // Check permission
    // ...
    // Assuming if you can see settings, you can see pending invites (or filter based on role)
    
    return await db.query.invitations.findMany({
        where: and(
            eq(invitations.organizationId, workspaceId),
            eq(invitations.status, "pending")
        )
    });
}
