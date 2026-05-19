import { apiError } from "@/lib/api/error-contract";
import { apiUnhandledError } from "@/lib/api/error-contract";
import { getVerifiedSession } from "@/lib/auth/dal";
import { toApiAuthError } from "@/lib/auth/error-map";
import { resolveTeacherOwnedClassroomAccess } from "@/lib/access/classroom-access";
import { getRedisSubscriber } from "@/lib/redis";

const encoder = new TextEncoder();

function formatSseEvent(event: string, payload: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function formatSseComment(comment: string) {
  return encoder.encode(`: ${comment}\n\n`);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const session = await getVerifiedSession();
    const { classroomId } = await params;

    const access = await resolveTeacherOwnedClassroomAccess({
      teacherUserId: session.user.id,
      classroomId,
    });

    if ("error" in access) {
      return apiError("UNAUTHORIZED", "Unauthorized");
    }

    const channel = `pubsub:realtime:classroom:${classroomId}`;
    const subscriber = getRedisSubscriber({ fresh: true });

    let cleanedUp = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const cleanup = async () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;

      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }

      subscriber.removeAllListeners("message");

      try {
        await subscriber.unsubscribe(channel);
      } catch {}

      try {
        await subscriber.quit();
      } catch {}
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          formatSseEvent("connected", {
            type: "connected",
            classroomId,
            occurredAt: new Date().toISOString(),
          }),
        );

        const handleMessage = (incomingChannel: string, message: string) => {
          if (incomingChannel !== channel) {
            return;
          }

          try {
            const payload = JSON.parse(message) as { type?: string };
            controller.enqueue(
              formatSseEvent(payload.type ?? "message", payload),
            );
          } catch {
            controller.enqueue(
              formatSseEvent("message", {
                type: "message",
                classroomId,
                occurredAt: new Date().toISOString(),
              }),
            );
          }
        };

        subscriber.on("message", handleMessage);
        await subscriber.subscribe(channel);

        heartbeat = setInterval(() => {
          try {
            controller.enqueue(formatSseComment(`keepalive ${Date.now()}`));
          } catch {}
        }, 15_000);

        request.signal.addEventListener(
          "abort",
          () => {
            void cleanup().finally(() => {
              try {
                controller.close();
              } catch {}
            });
          },
          { once: true },
        );
      },
      async cancel() {
        await cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const mapped = toApiAuthError(error);
    if (mapped) {
      return mapped;
    }

    return apiUnhandledError(
      error,
      "Failed to open classroom event stream",
      "/api/learning/classrooms/[classroomId]/events",
    );
  }
}
