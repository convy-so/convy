export type WebhookEventType =
  | "survey_created"
  | "new_conversation"
  | "analytics_updated";

export type WebhookPayload = {
  event: WebhookEventType;
  data: Record<string, unknown>;
  timestamp: string;
};
