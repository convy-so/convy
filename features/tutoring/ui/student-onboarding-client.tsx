"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Send, ChevronRight, CheckCircle2 } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { fetchOnboardingState } from "@/features/tutoring/public-client";
import { queryKeys } from "@/shared/http/query-keys";
import { cn } from "@/shared/ui/tailwind-class-utils";
import { motion, AnimatePresence } from "framer-motion";
import type { getOnboardingStateData } from "@/shared/http/page-data";

type Props = {
  membershipId: string;
  initialOnboardingState: Awaited<ReturnType<typeof getOnboardingStateData>>;
  completionHref?: string;
};

type OnboardingMessageSeed = {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown> | null;
};

function isOnboardingMessageRole(value: string): value is "assistant" | "user" {
  return value === "assistant" || value === "user";
}

function toTextUIMessages(
  messages: OnboardingMessageSeed[] | undefined,
): UIMessage[] {
  return (messages ?? []).flatMap((message) => {
    if (!isOnboardingMessageRole(message.role)) {
      return [];
    }

    const nextMessage: UIMessage = {
      id: message.id,
      role: message.role,
      parts: [{ type: "text", text: message.content }],
    };

    return [nextMessage];
  });
}

export function StudentOnboardingClient({
  membershipId,
  initialOnboardingState,
  completionHref,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hydratedInitialMessagesRef = useRef(false);
  const syncedMessageCountRef = useRef(0);

  const onboardingQuery = useQuery({
    queryKey: queryKeys.learning.onboarding,
    queryFn: fetchOnboardingState,
    initialData: initialOnboardingState,
    staleTime: 30_000,
  });

  const isCompleted = onboardingQuery.data?.completed;

  const initialMessages = useMemo(() => {
    return onboardingQuery.data && !onboardingQuery.data.completed
      ? toTextUIMessages(onboardingQuery.data.messages)
      : [];
  }, [onboardingQuery.data]);

  const onboardingTransport = useMemo(
    () => new DefaultChatTransport({ api: "/api/learning/onboarding" }),
    [],
  );

  const {
    messages: chatMessages,
    sendMessage,
    setMessages,
    status,
  } = useChat({
    id: `learning-onboarding-${membershipId}`,
    transport: onboardingTransport,
    onFinish: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.learning.onboarding }),
        queryClient.invalidateQueries({ queryKey: queryKeys.learning.me }),
      ]);
    },
  });

  useEffect(() => {
    if (
      !hydratedInitialMessagesRef.current &&
      chatMessages.length === 0 &&
      initialMessages.length > 0
    ) {
      hydratedInitialMessagesRef.current = true;
      setMessages(initialMessages);
    }
  }, [chatMessages.length, initialMessages, setMessages]);

  useEffect(() => {
    if (initialMessages.length === 0) {
      hydratedInitialMessagesRef.current = true;
    }
  }, [initialMessages.length]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [chatMessages.length, status]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [input]);

  useEffect(() => {
    if (status === "ready" && chatMessages.length > syncedMessageCountRef.current) {
      syncedMessageCountRef.current = chatMessages.length;
      void queryClient.invalidateQueries({ queryKey: queryKeys.learning.onboarding });
    }
  }, [chatMessages.length, queryClient, status]);

  useEffect(() => {
    if (isCompleted) {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.learning.me }),
        queryClient.invalidateQueries({ queryKey: queryKeys.learning.onboarding }),
      ]);

      const timer = setTimeout(() => {
        router.replace(completionHref ?? "/student/profile");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [completionHref, isCompleted, queryClient, router]);

  const isSending = status === "submitted" || status === "streaming";
  const showTypingBubble =
    status === "submitted" ||
    (status === "streaming" &&
      (chatMessages.length === 0 ||
        chatMessages[chatMessages.length - 1]?.role !== "assistant"));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const messageText = input.trim();
    if (!messageText || isSending) return;
    setInput("");
    await sendMessage({
      role: "user",
      parts: [{ type: "text", text: messageText }],
    });
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-white px-4 py-5 sm:px-5 lg:px-8">
      <AnimatePresence mode="wait">
        {isCompleted ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="mx-auto mt-6 w-full max-w-lg space-y-6 rounded-[2.5rem] border border-white/80 bg-white p-8 text-center sm:p-9"
          >
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 shadow-inner shadow-emerald-100">
                <CheckCircle2 className="h-10 w-10" />
              </div>
            </div>
            <div className="space-y-3">
              <h2 className="text-[1.6rem] font-black tracking-tight text-slate-900 sm:text-[1.9rem]">
                AI Calibration Complete!
              </h2>
              <p className="mx-auto max-w-md text-sm font-medium leading-6 text-slate-600 sm:text-[0.95rem]">
                Your learning profile has been successfully generated. We are now updating your tutoring profile.
              </p>
            </div>
            <div className="flex justify-center pt-2">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.24em] text-slate-400 animate-pulse">
                Opening Profile
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-auto flex min-h-[720px] w-full max-w-6xl flex-col overflow-hidden rounded-[3rem] bg-white"
          >
            <div className="flex min-h-[720px] flex-col bg-white">
              <div className="flex items-center gap-3 bg-slate-50/50 px-6 py-4 sm:px-7">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-500">
                  Calibration Assistant Active
                </span>
              </div>

              <div
                ref={chatContainerRef}
                className="custom-scrollbar flex-1 space-y-4 overflow-y-auto bg-white px-5 py-6 sm:px-7 sm:py-7"
              >
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "w-fit max-w-[92%] rounded-[1.9rem] px-4.5 py-3.5 text-sm font-medium leading-6 sm:max-w-[78%] sm:px-5 sm:py-4 sm:text-[0.98rem]",
                      msg.role === "assistant"
                        ? "mr-auto border border-slate-200 bg-white text-slate-700"
                        : "ml-auto bg-slate-900 text-white",
                    )}
                  >
                    {msg.parts
                      ?.map((part) => (part.type === "text" ? part.text : ""))
                      .join("")}
                  </div>
                ))}
                {showTypingBubble ? (
                  <div className="mr-auto w-fit rounded-[1.9rem] border border-slate-200 bg-white px-4.5 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.2s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.1s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300" />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="bg-white px-5 py-5 sm:px-7 sm:py-6">
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    void handleSubmit(event);
                  }}
                >
                  <label
                    htmlFor="student-onboarding-message"
                    className="block text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-500"
                  >
                    Tell the AI about you
                  </label>
                  <div className="relative rounded-[1.9rem] border border-slate-200 bg-slate-50 transition focus-within:border-indigo-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100">
                    <textarea
                      id="student-onboarding-message"
                      ref={inputRef}
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          const form = event.currentTarget.form;
                          form?.requestSubmit();
                        }
                      }}
                      placeholder="Share how you learn best, your favorite subjects, the goals you care about, and the kinds of examples that help things click."
                      rows={1}
                      className="max-h-[220px] min-h-[96px] w-full resize-none overflow-y-auto rounded-[1.9rem] bg-transparent px-5 pb-14 pt-4 text-sm font-medium leading-6 text-slate-700 outline-none sm:text-[0.98rem]"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-[1.9rem] bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent transition focus-within:from-white" />
                    <button
                      type="submit"
                      disabled={isSending || !input.trim()}
                      className="absolute bottom-3.5 right-3.5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="h-4.5 w-4.5" />
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
