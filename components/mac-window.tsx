"use client";

import { useEffect, useMemo, useState } from "react";

const prompts = [
  "Help me build a math quiz for grade 7",
  "Create simple revision questions on photosynthesis",
  "Write a quick check-in for struggling students",
];

export default function MacWindow() {
  const [promptIndex, setPromptIndex] = useState(0);
  const [typedCount, setTypedCount] = useState(0);

  const currentPrompt = useMemo(() => prompts[promptIndex], [promptIndex]);

  useEffect(() => {
    const doneTyping = typedCount >= currentPrompt.length;

    if (!doneTyping) {
      const timer = window.setTimeout(() => {
        setTypedCount((v) => v + 1);
      }, 35);
      return () => window.clearTimeout(timer);
    }

    const pauseTimer = window.setTimeout(() => {
      setTypedCount(0);
      setPromptIndex((v) => (v + 1) % prompts.length);
    }, 1200);

    return () => window.clearTimeout(pauseTimer);
  }, [typedCount, currentPrompt]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-[18px] border border-gray-200 bg-[#FAFAFA] p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3 rounded-[14px] bg-white px-4 py-4 sm:px-5">
          <p className="min-h-[28px] text-left text-[15px] text-[#3D3D3D] sm:text-[18px]">
            {currentPrompt.slice(0, typedCount)}
            <span className="ml-0.5 inline-block h-[1.1em] w-[2px] animate-pulse bg-[#3D3D3D] align-middle" />
          </p>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#080808] text-white transition-transform duration-300 hover:scale-105 hover:bg-[#1d1d1d]"
            aria-label="Send"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
