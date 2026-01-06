import { env } from "@/lib/env";
import { PLAN_PRICES_USD_CENTS, PlanId, BillingInterval } from "./types";

const COINBASE_API_URL = "https://api.commerce.coinbase.com";

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
    [key: string]: CoinbasePrice; // Crypto prices (BTC, ETH, etc.)
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

class CoinbaseCommerceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "CoinbaseCommerceError";
  }
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

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

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
    if (error instanceof CoinbaseCommerceError) {
      throw error;
    }
    throw new Error(
      error instanceof Error 
        ? `Coinbase Commerce Request Failed: ${error.message}` 
        : "Unknown Coinbase Commerce Request Failed"
    );
  }
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


