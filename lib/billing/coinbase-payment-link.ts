import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Coinbase Commerce Payment Link Client
 * 
 * This client manages "Payment Links" via the Coinbase Commerce Hosted Charges API.
 * It provides a modern interface for:
 * - Creating hosted payment pages (charges)
 * - Monitoring payment status via webhooks or polling
 * - Supporting various cryptocurrencies (USDC, BTC, ETH, etc.)
 */

const COINBASE_API_URL = "https://api.commerce.coinbase.com";

// Retry configuration for resilience
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Payment Link object returned from the API
 */
export interface CoinbasePaymentLink {
  id: string;
  name: string;
  description: string;
  url: string;
  amount: string;
  currency: string;
  network: string;
  created_at: string;
  expires_at?: string;
  metadata?: Record<string, unknown>;
  status: "pending" | "completed" | "failed" | "expired";
  payment?: {
    id: string;
    status: string;
    amount: string;
    currency: string;
    transaction_hash?: string;
  };
}

/**
 * Parameters for creating a payment link
 */
export interface CreatePaymentLinkParams {
  /** Display name for the payment (shown to customer) */
  name: string;
  /** Description of what the payment is for */
  description: string;
  /** Amount in USDC (as string, e.g., "29.00") */
  amount: string;
  /** URL to redirect after successful payment */
  successRedirectUrl: string;
  /** URL to redirect if payment is cancelled */
  cancelRedirectUrl: string;
  /** Custom metadata (userId, planId, etc.) */
  metadata?: Record<string, string | number | boolean>;
  /** Optional expiration timestamp (ISO 8601) */
  expiresAt?: string;
}

/**
 * Custom error class for Payment Link API errors
 */
export class CoinbasePaymentLinkError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "CoinbasePaymentLinkError";
  }
}

/**
 * Check if an error is retryable (transient network/server errors)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof CoinbasePaymentLinkError) {
    // Retry on 5xx server errors and 429 rate limits
    return error.status >= 500 || error.status === 429;
  }
  // Retry on network errors (fetch failures)
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }
  // Retry on abort/timeout errors
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  return false;
}

/**
 * Sleep utility for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make an authenticated request to the Payment Link API with retry logic
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${COINBASE_API_URL}${endpoint}`;
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-CC-Api-Key": env.COINBASE_COMMERCE_API_KEY,
    "X-CC-Version": "2018-03-22",
    ...(options.headers as Record<string, string> || {}),
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      logger.debug("Coinbase Payment Link API request", {
        endpoint,
        method: options.method || "GET",
        attempt: attempt + 1,
      });

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new CoinbasePaymentLinkError(
          response.status,
          errorData?.error?.type || "unknown_error",
          errorData?.error?.message || `Payment Link API Error: ${response.statusText}`
        );
      }

      const json = await response.json();
      return json.data ?? json;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on non-retryable errors or last attempt
      if (!isRetryableError(error) || attempt === MAX_RETRIES - 1) {
        break;
      }

      // Exponential backoff: 1s, 2s, 4s...
      const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
      logger.warn("Coinbase Payment Link API request failed, retrying", {
        endpoint,
        attempt: attempt + 1,
        delayMs,
        error: lastError.message,
      });
      await sleep(delayMs);
    }
  }

  // Throw the last error after all retries exhausted
  if (lastError instanceof CoinbasePaymentLinkError) {
    throw lastError;
  }
  throw new Error(
    lastError
      ? `Coinbase Payment Link Request Failed: ${lastError.message}`
      : "Unknown Coinbase Payment Link Request Failed"
  );
}

/**
 * Coinbase Commerce Payment Link API client
 * 
 * Usage:
 * ```typescript
 * const link = await coinbasePaymentLink.create({
 *   name: "Pro Plan (monthly)",
 *   description: "Pro subscription via crypto",
 *   amount: "29.00",
 *   successRedirectUrl: "https://app.example.com/success",
 *   cancelRedirectUrl: "https://app.example.com/cancel",
 *   metadata: { userId: "user_123", planId: "pro", interval: "month" }
 * });
 * // Redirect user to link.url
 * ```
 */
export const coinbasePaymentLink = {
  /**
   * Create a new payment link
   * @param params Payment link parameters
   * @returns Created payment link object
   */
  create: async (params: CreatePaymentLinkParams): Promise<CoinbasePaymentLink> => {
    // Build request body matching Payment Link API schema
    const body = {
      name: params.name,
      description: params.description,
      pricing_type: "fixed_price",
      local_price: {
        amount: params.amount,
        currency: "USD", // We price in USD, user pays in USDC equivalent
      },
      redirect_url: params.successRedirectUrl,
      cancel_url: params.cancelRedirectUrl,
      metadata: params.metadata || {},
    };

    const response = await request<CoinbasePaymentLink>("/charges", {
      method: "POST",
      body: JSON.stringify(body),
    });

    logger.info("Coinbase payment link created", {
      paymentLinkId: response.id,
      amount: params.amount,
      metadata: params.metadata,
    });

    // Map response to our interface
    return {
      id: response.id,
      name: params.name,
      description: params.description,
      url: (response as any).hosted_url || response.url,
      amount: params.amount,
      currency: "USD",
      network: "base",
      created_at: (response as any).created_at || new Date().toISOString(),
      expires_at: (response as any).expires_at,
      metadata: params.metadata,
      status: "pending",
    };
  },

  /**
   * Retrieve an existing payment link by ID
   * @param id Payment link ID
   * @returns Payment link object with current status
   */
  retrieve: async (id: string): Promise<CoinbasePaymentLink> => {
    const response = await request<any>(`/charges/${id}`, {
      method: "GET",
    });

    // Map the charge response to our interface
    return {
      id: response.id,
      name: response.name || "",
      description: response.description || "",
      url: response.hosted_url || response.url || "",
      amount: response.pricing?.local?.amount || "0",
      currency: response.pricing?.local?.currency || "USD",
      network: "base",
      created_at: response.created_at || new Date().toISOString(),
      expires_at: response.expires_at,
      metadata: response.metadata,
      status: mapChargeStatus(response.timeline),
      payment: response.payments?.[0] ? {
        id: response.payments[0].transaction_id || "",
        status: response.payments[0].status || "",
        amount: response.payments[0].value?.local?.amount || "0",
        currency: response.payments[0].value?.local?.currency || "USD",
        transaction_hash: response.payments[0].transaction_id,
      } : undefined,
    };
  },
};

/**
 * Map Coinbase charge timeline to our status
 */
function mapChargeStatus(timeline: Array<{ status: string }> | undefined): CoinbasePaymentLink["status"] {
  if (!timeline || timeline.length === 0) {
    return "pending";
  }
  
  const latestStatus = timeline[timeline.length - 1]?.status?.toUpperCase();
  
  switch (latestStatus) {
    case "COMPLETED":
    case "CONFIRMED":
    case "RESOLVED":
      return "completed";
    case "FAILED":
    case "CANCELED":
      return "failed";
    case "EXPIRED":
      return "expired";
    default:
      return "pending";
  }
}

