"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Bot, Loader2, Send } from "lucide-react";
import { z } from "zod";
import type {
  RefinementMessage,
  RefinementProposal,
} from "@/lib/education/playbooks";
import {
  refinementMessageSchema,
  refinementProposalSchema,
} from "@/lib/education/playbooks";

type StoredMessage = Pick<RefinementMessage, "id" | "role" | "content">;
type Proposal = RefinementProposal;

const storedMessageSchema = refinementMessageSchema.pick({
  id: true,
  role: true,
  content: true,
});

const refinementResponseSchema = z.object({
  messages: z.array(storedMessageSchema).optional(),
  proposals: z
    .array(
      z.union([
        refinementProposalSchema,
        z.object({ proposal: refinementProposalSchema }),
      ]),
    )
    .optional(),
});

export function RefinementAssistantPanel({ surveyId }: { surveyId: string }) {
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/surveys/${surveyId}/refinement`);

      if (!response.ok) {
        throw new Error("Failed to load refinement context.");
      }

      const data = refinementResponseSchema.parse(await response.json());
      setMessages(
        Array.isArray(data.messages)
          ? data.messages.map((item) => ({
              id: item.id,
              role: item.role,
              content: item.content,
            }))
          : [],
      );
      setProposals(
        Array.isArray(data.proposals)
          ? data.proposals.map((item) => ("proposal" in item ? item.proposal : item))
          : [],
      );
    } finally {
      setIsLoading(false);
    }
  }, [surveyId]);

  useEffect(() => {
    void load().catch((loadError) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load refinement context.",
      );
    });
  }, [load]);

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    setIsSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/surveys/${surveyId}/refinement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to send refinement request.");
      }

      setInput("");
      await load();
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Failed to send refinement request.",
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleProposal(proposalId: string, action: "approve" | "reject", applyToLive = false) {
    setError(null);
    const response = await fetch(`/api/surveys/${surveyId}/refinement/proposals/${proposalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, applyToLive }),
    });

    if (!response.ok) {
      const message = `Failed to ${action} refinement proposal.`;
      setError(message);
      return;
    }

    await load();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Refinement Assistant</h3>
        <p className="mt-1 text-xs text-gray-500">
          Chat through rehearsal changes. The assistant proposes bounded updates for approval.
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
        <p className="font-semibold text-gray-900">Best prompts for refinement</p>
        <ul className="mt-2 space-y-1">
          <li>- Use concrete changes the system can apply.</li>
          <li>- Separate style changes from survey-design changes when you can.</li>
          <li>- If a topic is missing, name it directly.</li>
          <li>- If tone is wrong, say what it should sound like in practice.</li>
        </ul>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading refinement context...
        </div>
      ) : (
        <>
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-3">
            {messages.length === 0 ? (
              <div className="text-sm text-gray-500">
                Ask for a concrete change in plain language. Example: &quot;I want the interviewer to sound warmer and ask shorter questions.&quot;
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    message.role === "assistant"
                      ? "bg-white text-gray-800"
                      : "ml-auto max-w-[85%] bg-gray-900 text-white"
                  }`}
                >
                  {message.role === "assistant" && <Bot className="mb-1 h-3.5 w-3.5 text-gray-500" />}
                  {message.content}
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSend} className="flex gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Describe the improvement you want, what felt off, or what the survey should cover instead."
              className="h-24 flex-1 rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-300"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="flex h-24 w-12 items-center justify-center rounded-xl bg-gray-900 text-white"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>

          <div className="space-y-3">
            {proposals.map((proposal) => (
              <div key={proposal.id} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{proposal.title}</div>
                    <div className="mt-1 text-xs text-gray-500">{proposal.type} · {proposal.status}</div>
                  </div>
                </div>
                <p className="mt-2 text-sm text-gray-700">{proposal.interpretation}</p>
                {proposal.runtimeEffect?.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-gray-600">
                    {proposal.runtimeEffect.slice(0, 4).map((item, index) => (
                      <li key={`${proposal.id}-${index}`}>- {item}</li>
                    ))}
                  </ul>
                )}
                {proposal.status === "pending" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleProposal(proposal.id, "approve", false)}
                      className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Approve
                    </button>
                    {(proposal.type === "conducting_profile" || proposal.type === "personality_overlay") && (
                      <button
                        type="button"
                        onClick={() => handleProposal(proposal.id, "approve", true)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700"
                      >
                        Approve + promote live
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleProposal(proposal.id, "reject")}
                      className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}



