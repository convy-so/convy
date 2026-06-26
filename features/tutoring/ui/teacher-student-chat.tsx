"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, History, Loader2, Plus, Send } from "lucide-react";
import { useLocale } from "next-intl";

import {
  answerTeacherStudentQuestionAction,
  saveTeacherStudentChatSessionAction,
} from "@/app/actions/classroom";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import { readJsonResponseValue } from "@/shared/http/json";
import { cn } from "@/shared/ui/tailwind-class-utils";

type TeacherChatSource = {
  id: string;
  label: string;
};

type TeacherChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: Array<Record<string, unknown>>;
};

type TeacherChatSession = {
  id: string;
  title: string;
  language: string;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTeacherChatSource(value: unknown): value is TeacherChatSource {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string"
  );
}

function isTeacherChatMessage(value: unknown): value is TeacherChatMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string" &&
    (value.parts === undefined || Array.isArray(value.parts))
  );
}

function isTeacherChatSession(value: unknown): value is TeacherChatSession {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.language === "string" &&
    typeof value.updatedAt === "string"
  );
}

function parseTeacherChatSessions(value: unknown): TeacherChatSession[] {
  if (!isRecord(value) || !Array.isArray(value.sessions)) {
    return [];
  }

  return value.sessions.filter(isTeacherChatSession);
}

function parseTeacherChatSessionDetail(value: unknown): {
  id: string;
  messages: TeacherChatMessage[];
} | null {
  if (!isRecord(value) || !isRecord(value.session)) {
    return null;
  }

  const session = value.session;
  if (typeof session.id !== "string" || !Array.isArray(session.messages)) {
    return null;
  }

  return {
    id: session.id,
    messages: session.messages.filter(isTeacherChatMessage),
  };
}

function extractSources(message: TeacherChatMessage) {
  return (message.parts ?? []).flatMap((part) =>
    part.type === "sources" && Array.isArray(part.sources)
      ? part.sources.filter(isTeacherChatSource)
      : [],
  );
}

function extractConfidence(message: TeacherChatMessage) {
  const sourcePart = (message.parts ?? []).find((part) => part.type === "sources");
  return typeof sourcePart?.confidence === "string" ? sourcePart.confidence : null;
}

export function TeacherStudentChat({
  classroomStudentId,
  studentName,
}: {
  classroomStudentId: string;
  studentName: string;
}) {
  const locale = useLocale();
  const [messages, setMessages] = useState<TeacherChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sessionsQuery = useQuery({
    queryKey: ["teacherStudentChatSessions", classroomStudentId],
    queryFn: async () => {
      const response = await fetch(
        `/api/students/${classroomStudentId}/chat-sessions`,
        {
          credentials: "include",
        },
      );
      if (!response.ok) {
        throw new Error("Failed to load teacher chat sessions.");
      }
      return parseTeacherChatSessions(await readJsonResponseValue(response));
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSubmitting]);

  async function persistSession(nextMessages: TeacherChatMessage[], sessionId?: string | null) {
    const result = await saveTeacherStudentChatSessionAction({
      classroomStudentId,
      sessionId: sessionId ?? currentSessionId ?? undefined,
      language: locale,
      messages: nextMessages,
    });

    if (!result.success) {
      throw new Error(getFriendlyActionError(result.error));
    }

    setCurrentSessionId(result.data.id);
    void sessionsQuery.refetch();
  }

  async function loadSession(sessionId: string) {
    const response = await fetch(
      `/api/students/${classroomStudentId}/chat-sessions/${sessionId}`,
      { credentials: "include" },
    );

    if (!response.ok) {
      return;
    }

    const payload = parseTeacherChatSessionDetail(
      await readJsonResponseValue(response),
    );
    if (!payload) {
      return;
    }

    setCurrentSessionId(payload.id);
    setMessages(
      payload.messages.map((message, index) => ({
        id: message.id || `loaded-${payload.id}-${index}`,
        role: message.role,
        content: message.content,
        parts: message.parts,
      })),
    );
  }

  async function submitQuestion(question: string) {
    const normalized = question.trim();
    if (!normalized || isSubmitting) return;
    const previousMessages = messages;

    const userMessage: TeacherChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: normalized,
    };
    const optimisticMessages = [...messages, userMessage];
    setMessages(optimisticMessages);
    setInput("");
    setIsSubmitting(true);

    try {
      const result = await answerTeacherStudentQuestionAction({
        classroomStudentId,
        language: locale,
        messages: optimisticMessages,
      });

      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }

      const assistantMessage: TeacherChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.data.answer,
        parts: [
          {
            type: "sources",
            sources: result.data.evidenceHighlights.map((item, index) => ({
              id: `evidence-${index + 1}`,
              label: item,
            })),
          },
        ],
      };

      const nextMessages = [...optimisticMessages, assistantMessage];
      await persistSession(nextMessages);
      setMessages(nextMessages);
    } catch {
      setMessages(previousMessages);
      setInput(normalized);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-5">
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">
          Teacher copilot
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Ask grounded questions about this student&apos;s learning evidence.
          The assistant should say when the evidence is too weak.
        </p>
      </div>

      <div
        className={`grid gap-5 p-6 ${
          isHistoryOpen ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "grid-cols-1"
        }`}
      >
        {isHistoryOpen ? (
          <aside className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <History className="h-4 w-4 text-slate-500" />
                Recent chats
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-950"
                aria-label="Hide recent chats"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setCurrentSessionId(null);
                setMessages([]);
                setInput("");
              }}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              <Plus className="h-4 w-4" />
              New chat
            </button>

            <div className="mt-4 space-y-2">
              {sessionsQuery.isLoading ? (
                <div className="flex items-center gap-2 px-1 py-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading chats...
                </div>
              ) : sessionsQuery.data?.length ? (
                sessionsQuery.data.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                      onClick={() => {
                        void loadSession(session.id);
                      }}
                      className={cn(
                      "w-full rounded-lg border bg-white px-3 py-3 text-left text-sm transition",
                      currentSessionId === session.id
                        ? "border-sky-300 bg-sky-50/80 text-slate-950"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900",
                    )}
                  >
                    <div className="truncate font-semibold">{session.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {new Intl.DateTimeFormat(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(session.updatedAt))}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">
                  No saved chats yet.
                </div>
              )}
            </div>
          </aside>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">
                Conversation
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Ask about progress, misconceptions, patterns, and evidence.
              </div>
            </div>
            {!isHistoryOpen ? (
              <button
                type="button"
                onClick={() => setIsHistoryOpen(true)}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-950"
                aria-label="Show recent chats"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div
            ref={scrollRef}
            className="max-h-[520px] space-y-4 overflow-y-auto pr-1"
          >
            {messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
                Ask things like &quot;What evidence suggests this student is improving in fractions?&quot; or &quot;What misconceptions keep showing up in recent sessions?&quot;
              </div>
            ) : (
              messages.map((message) => {
                const sources = extractSources(message);
                const confidence = extractConfidence(message);

                return (
                  <div
                    key={message.id}
                    className={cn(
                      "rounded-xl px-4 py-4",
                      message.role === "user"
                        ? "ml-auto max-w-[86%] border border-sky-200 bg-sky-50/90"
                        : "max-w-[92%] border border-slate-200 bg-slate-50/90",
                    )}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      {message.role === "user" ? "Teacher" : "Copilot"}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {message.content}
                    </p>
                    {confidence ? (
                      <div className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Confidence: {confidence}
                      </div>
                    ) : null}
                    {sources.length ? (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Sources
                        </div>
                        <div className="mt-2 space-y-2">
                          {sources.map((source) => (
                            <div key={source.id} className="text-sm text-slate-600">
                              {source.label} ({source.id})
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
            {isSubmitting ? (
              <div className="flex items-center gap-2 px-2 py-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking through the evidence...
              </div>
            ) : null}
          </div>

          <form
            className="mt-4 flex gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitQuestion(input);
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={3}
              placeholder={`Ask about ${studentName}'s progress, misconceptions, patterns, or evidence...`}
              className="min-h-[84px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-sky-300"
            />
            <button
              type="submit"
              disabled={!input.trim() || isSubmitting}
              className="inline-flex h-fit items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Ask
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

