import { env } from "@/lib/env";

const COINBASE_API_URL = "https://api.commerce.coinbase.com";

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;

interface CoinbasePrice {
  amount: string;
  currency: string;
}

export interface CoinbaseCharge {
  id: string;
  resource: "charge";
  code: string;
  name: string;
  description: string;
  logo_url?: string;
  hosted_url: string;
  created_at: string;
  expires_at: string;
  timeline: Array<{
    status: string;
    time: string;
    context?: string;
  }>;
  metadata: Record<string, unknown>;
  pricing: {
    local: CoinbasePrice;
    [key: string]: CoinbasePrice; 
  };
  pricing_type: "fixed_price" | "no_price";
  payments: Array<unknown>;
  addresses?: Record<string, string>;
  redirect_url?: string;
  cancel_url?: string;
}

export interface CreateChargeParams {
  name: string;
  description: string;
  pricing_type: "fixed_price" | "no_price";
  local_price?: CoinbasePrice;
  metadata?: Record<string, string | number | boolean>;
  redirect_url?: string;
  cancel_url?: string;
}

export class CoinbaseCommerceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "CoinbaseCommerceError";
  }
}

/**
 * Determines if an error is retryable (transient network/server errors)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof CoinbaseCommerceError) {
    // Retry on 5xx server errors and 429 rate limits
    return error.status >= 500 || error.status === 429;
  }
  // Retry on network errors (fetch failures)
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }
  return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${COINBASE_API_URL}${endpoint}`;
  
  const headers = {
    "Content-Type": "application/json",
    "X-CC-Api-Key": env.COINBASE_COMMERCE_API_KEY,
    "X-CC-Version": "2018-03-22",
    ...options.headers,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new CoinbaseCommerceError(
          response.status,
          errorData?.error?.type || "unknown_error",
          errorData?.error?.message || `Coinbase Commerce API Error: ${response.statusText}`
        );
      }

      const json = await response.json();
      return json.data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on non-retryable errors or last attempt
      if (!isRetryableError(error) || attempt === MAX_RETRIES - 1) {
        break;
      }

      // Exponential backoff: 1s, 2s, 4s...
      const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
      await sleep(delayMs);
    }
  }

  // Throw the last error after all retries exhausted
  if (lastError instanceof CoinbaseCommerceError) {
    throw lastError;
  }
  throw new Error(
    lastError 
      ? `Coinbase Commerce Request Failed: ${lastError.message}` 
      : "Unknown Coinbase Commerce Request Failed"
  );
}

export const coinbase = {
  charges: {
    create: (params: CreateChargeParams) => 
      request<CoinbaseCharge>("/charges", {
        method: "POST",
        body: JSON.stringify(params),
      }),
      
    retrieve: (id: string) => 
      request<CoinbaseCharge>(`/charges/${id}`, {
        method: "GET",
      }),
  },
};


