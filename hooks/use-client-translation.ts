"use client";

import { useState, useEffect } from "react";
import { getClientTranslation } from "@/app/actions/translate";

/**
 * Hook for Dynamic AI-driven Translation in client components
 */
export function useClientTranslation() {
  const [translations, setTranslations] = useState<Record<string, string>>({});

  const t = async (text: string, context?: string) => {
    if (translations[text]) return translations[text];

    const result = await getClientTranslation(text, context);
    setTranslations((prev) => ({ ...prev, [text]: result }));
    return result;
  };

  return { t };
}
