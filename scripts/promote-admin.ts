import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";

function normalizeIdentityEmail(email: string) {
  return email.trim().toLowerCase();
}

function readEmailArg() {
  const email = process.argv
    .slice(2)
    .find((value) => value.trim().length > 0 && value !== "--");
  if (!email) {
    throw new Error(
      "Missing email argument. Run with: pnpm admin:promote -- user@example.com",
    );
  }

  return normalizeIdentityEmail(email);
}

async function main() {
  const email = readEmailArg();

  const existingUser = await getDb().query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!existingUser) {
    throw new Error(`No user found for email: ${email}`);
  }

  if (existingUser.role === "admin") {
    console.info("[promote-admin] user is already an admin", {
      userId: existingUser.id,
      email: existingUser.email,
    });
    return;
  }

  await getDb()
    .update(users)
    .set({
      role: "admin",
      updatedAt: new Date(),
    })
    .where(eq(users.id, existingUser.id));

  console.info("[promote-admin] promoted user to admin", {
    userId: existingUser.id,
    email: existingUser.email,
    previousRole: existingUser.role,
    newRole: "admin",
    emailVerified: existingUser.emailVerified,
  });
}

main().catch((error) => {
  console.error("[promote-admin] failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
