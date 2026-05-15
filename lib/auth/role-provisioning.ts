import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";

export async function provisionUserRole(params: {
  userId: string;
  role: "expert" | "admin" | "teacher" | "student";
}) {
  await getDb()
    .update(users)
    .set({
      role: params.role,
      updatedAt: new Date(),
    })
    .where(eq(users.id, params.userId));
}
