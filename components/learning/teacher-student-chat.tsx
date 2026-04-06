"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, History, Loader2, Send } from "lucide-react";
import { useLocale } from "next-intl";

import { GlassPanel } from "@/components/learning/glass-panel";
import { SectionHeading } from "@/components/learning/section-heading";
import { cn } from "@/lib/utils";

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

function extractSources(message: TeacherChatMessage) {
  return (message.parts ?? []).flatMap((part) =>
    part.type === "sources" && Array.isArray(part.sources)
      ? (part.sources as TeacherChatSource[])
      : [],
  );
}

function extractConfidence(message: TeacherChatMessage) {
  const sourcePart = (message.parts ?? []).find((part) => part.type === "sources");
  return typeof sourcePart?.confidence === "string" ? sourcePart.confidence : null;
}

export function TeacherStudentChat({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const locale = useLocale();
  const [messages, setMessages] = useState<TeacherChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(
    () => [
      `What learning patterns have you observed in ${studentName}?`,
      `What misconceptions seem to recur for ${studentName}?`,
      `Where does ${studentName} appear to need the most support right now?`,
      `What evidence suggests progress or regression recently?`,
    ],
    [studentName],
  );

  const sessionsQuery = useQuery({
    queryKey: ["learningTeacherChatSessions", studentId],
    queryFn: async () => {
      const response = await fetch(`/api/learning/students/${studentId}/chat-sessions`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load teacher chat sessions.");
      }
      const payload = (await response.json()) as { sessions: TeacherChatSession[] };
      return payload.sessions ?? [];
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSubmitting]);

  async function persistSession(nextMessages: TeacherChatMessage[], sessionId?: string | null) {
    const response = await fetch(`/api/learning/students/${studentId}/chat-sessions`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: sessionId ?? currentSessionId,
        language: locale,
        messages: nextMessages,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to save teacher chat session.");
    }

    const payload = (await response.json()) as {
      session: { id: string; title: string };
    };
    setCurrentSessionId(payload.session.id);
    void sessionsQuery.refetch();
  }

  async function loadSession(sessionId: string) {
    const response = await fetch(
      `/api/learning/students/${studentId}/chat-sessions/${sessionId}`,
      { credentials: "include" },
    );

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as {
      session: {
        id: string;
        messages: TeacherChatMessage[];
      };
    };

    setCurrentSessionId(payload.session.id);
    setMessages(
      (payload.session.messages ?? []).map((message, index) => ({
        id: message.id ?? `loaded-${payload.session.id}-${index}`,
        role: message.role,
        content: message.content,
        parts: message.parts,
      })),
    );
  }

  async function submitQuestion(question: string) {
    const normalized = question.trim();
    if (!normalized || isSubmitting) return;

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
      const response = await fetch(`/api/learning/students/${studentId}/chat`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language: locale,
          messages: optimisticMessages,
        }),
      });

      if (!response.ok) {
        throw new Error("Teacher copilot could not answer right now.");
      }

      const payload = (await response.json()) as {
        success: true;
        data: {
          response: string;
          confidence: string;
          sources: TeacherChatSource[];
        };
      };

      const assistantMessage: TeacherChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: payload.data.response,
        parts: [
          {
            type: "sources",
            confidence: payload.data.confidence,
            sources: payload.data.sources,
          },
        ],
      };

      const nextMessages = [...optimisticMessages, assistantMessage];
      setMessages(nextMessages);
      await persistSession(nextMessages);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Teacher copilot could not answer right now.",
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <GlassPanel className="p-6">
      <SectionHeading
        eyebrow="Teacher Copilot"
        title="Chat With Student Data"
        description="Ask grounded questions about this student's learning evidence. The assistant should say when the evidence is too weak."
      />

      <div className="mt-6 grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
        <div className="space-y-4">
          <div className="rounded-[18px] border border-white/70 bg-white/75 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <History className="h-4 w-4 text-slate-500" />
              Recent chats
            </div>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setCurrentSessionId(null);
                  setMessages([]);
                  setInput("");
                }}
                className="w-full rounded-[14px] border border-dashed border-slate-200 bg-white/80 px-3 py-3 text-left text-sm text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                Start a new chat
              </button>
              {sessionsQuery.isLoading ? (
                <div className="flex items-center gap-2 px-1 py-3 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading chats...
                </div>
              ) : sessionsQuery.data?.length ? (
                sessionsQuery.data.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => loadSession(session.id)}
                    className={cn(
                      "w-full rounded-[14px] border px-3 py-3 text-left text-sm transition",
                      currentSessionId === session.id
                        ? "border-sky-300 bg-sky-50/80 text-slate-950"
                        : "border-white/70 bg-white/75 text-slate-600 hover:border-slate-200 hover:text-slate-900",
                    )}
                  >
                    <div className="font-semibold">{session.title}</div>
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
                <div className="rounded-[14px] border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-sm text-slate-500">
                  No saved chats yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[18px] border border-white/70 bg-white/75 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Brain className="h-4 w-4 text-emerald-700" />
              Helpful prompts
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void submitQuestion(suggestion)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-white/70 bg-white/78 p-4">
          <div
            ref={scrollRef}
            className="max-h-[520px] space-y-4 overflow-y-auto pr-1"
          >
            {messages.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-sm leading-6 text-slate-500">
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
                      "rounded-[18px] px-4 py-4",
                      message.role === "user"
                        ? "ml-auto max-w-[86%] border border-sky-200 bg-sky-50/90"
                        : "max-w-[92%] border border-white/70 bg-slate-50/90",
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
                      <div className="mt-3 rounded-[14px] border border-slate-200 bg-white/90 px-3 py-3">
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
              className="min-h-[84px] flex-1 resize-none rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-sky-300"
            />
            <button
              type="submit"
              disabled={!input.trim() || isSubmitting}
              className="inline-flex h-fit items-center gap-2 rounded-[18px] bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
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
    </GlassPanel>
  );
}
