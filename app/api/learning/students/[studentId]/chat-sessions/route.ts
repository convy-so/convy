import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { learningTeacherChatSessions } from "@/db/schema";
import { getVerifiedSession } from "@/lib/auth/session";
import { getTeacherClassroomAccess } from "@/lib/learning/access";
import { normalizeAppLocale } from "@/lib/i18n/config";

const learningChatMessageSchema = z.object({
  role: z.string(),
  content: z.string().optional(),
  parts: z.array(z.record(z.string(), z.unknown())).optional(),
  id: z.string().optional(),
  createdAt: z.string().optional(),
});

const requestSchema = z.object({
  sessionId: z.string().optional(),
  title: z.string().optional(),
  language: z.string().optional(),
  messages: z.array(learningChatMessageSchema),
});

function deriveTitle(messages: Array<z.infer<typeof learningChatMessageSchema>>) {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser) return "New Chat";

  if (typeof firstUser.content === "string" && firstUser.content.trim()) {
    return firstUser.content.trim().slice(0, 72);
  }

  const partText = firstUser.parts
    ?.flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join("")
    .trim();

  return partText?.slice(0, 72) || "New Chat";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { studentId } = await params;

    const membership = await getDb().query.classroomStudents.findFirst({
      where: (table, { eq }) => eq(table.id, studentId),
    });

    if (!membership) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const access = await getTeacherClassroomAccess(
      session.user.id,
      membership.classroomId,
    );

    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const sessions = await getDb()
      .select({
        id: learningTeacherChatSessions.id,
        title: learningTeacherChatSessions.title,
        language: learningTeacherChatSessions.language,
        createdAt: learningTeacherChatSessions.createdAt,
        updatedAt: learningTeacherChatSessions.updatedAt,
      })
      .from(learningTeacherChatSessions)
      .where(
        and(
          eq(learningTeacherChatSessions.classroomStudentId, studentId),
          eq(learningTeacherChatSessions.userId, session.user.id),
        ),
      )
      .orderBy(desc(learningTeacherChatSessions.updatedAt));

    return NextResponse.json({ sessions });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { studentId } = await params;
    const body = requestSchema.parse(await request.json());

    const membership = await getDb().query.classroomStudents.findFirst({
      where: (table, { eq }) => eq(table.id, studentId),
      with: {
        classroom: true,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const access = await getTeacherClassroomAccess(
      session.user.id,
      membership.classroomId,
    );

    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const title = body.title?.trim() || deriveTitle(body.messages);
    const language = normalizeAppLocale(
      body.language ?? membership.classroom.defaultContentLocale,
    );

    if (body.sessionId) {
      const [updated] = await getDb()
        .update(learningTeacherChatSessions)
        .set({
          title,
          language,
          messages: body.messages,
        })
        .where(
          and(
            eq(learningTeacherChatSessions.id, body.sessionId),
            eq(learningTeacherChatSessions.classroomStudentId, studentId),
            eq(learningTeacherChatSessions.userId, session.user.id),
          ),
        )
        .returning({
          id: learningTeacherChatSessions.id,
          title: learningTeacherChatSessions.title,
        });

      if (!updated) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }

      return NextResponse.json({ session: updated });
    }

    const [created] = await getDb()
      .insert(learningTeacherChatSessions)
      .values({
        id: `learn_chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        organizationId: membership.classroom.organizationId,
        classroomStudentId: studentId,
        userId: session.user.id,
        language,
        title,
        messages: body.messages,
      })
      .returning({
        id: learningTeacherChatSessions.id,
        title: learningTeacherChatSessions.title,
      });

    return NextResponse.json({ session: created });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
