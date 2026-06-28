import type { AppLocale } from "@/shared/i18n/config";

type SupportedLanguage = AppLocale;

export interface SearchFilters {
  surveyId?: string;
  sourceType?: ("response" | "insight" | "analytics" | "document")[];
  minDate?: Date;
  limit?: number;
  language?: SupportedLanguage;
  sessionType?: "sample" | "live";
}

export interface SearchResult {
  id: string;
  content: string;
  retrievalContent?: string;
  score: number;
  metadata: Record<string, unknown>;
  sourceType: string;
  sourceId?: string;
  createdAt: Date;
}
