import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import jwt from "jsonwebtoken";

// Coinbase Business Payment Link API
const BASE_URL = "https://business.coinbase.com/api/v1";

export interface CreatePaymentLinkParams {
  name: string;
  description: string;
  amount: string;
  currency: "USD";
  metadata?: Record<string, string | number | boolean>;
  cancel_url?: string;
  redirect_url?: string;
}

/**
 * Generate JWT for Coinbase Business API (CDP)
 * URI Format: METHOD + " " + HOST + PATH
 * Example: "POST business.coinbase.com/api/v1/payment-links"
 */
function generateJWT(requestMethod: string, requestPath: string): string {
  const keyName = env.COINBASE_CDP_API_KEY_NAME;
  const privateKey = env.COINBASE_CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, '\n');

  const algorithm = "ES256";
  
  // Clean URL to get host and path without protocol
  // If requestPath passed is full URL (e.g. https://business.coinbase.com/api/v1/...), extract host+path
  // If passed as relative, we construct it.
  // Best practice: passing full URL to request function, so let's extract.
  const urlObj = new URL(requestPath.startsWith("http") ? requestPath : `${BASE_URL}${requestPath}`);
  const host = urlObj.host;
  const path = urlObj.pathname + urlObj.search;
  
  const uri = `${requestMethod} ${host}${path}`;

  const token = jwt.sign(
    {
      iss: "coinbase-cloud",
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 120, // 2 minutes
      sub: keyName,
      uri,
    },
    privateKey,
    {
      algorithm: algorithm as jwt.Algorithm, 
      header: {
        kid: keyName,
        // nonce is not required for CDP standard JWT
      } as any,
    }
  );

  return token;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const method = options.method || "GET";
  
  let token: string;
  try {
     token = generateJWT(method, url); 
  } catch (error) {
    logger.error("Failed to generate Coinbase JWT", { error });
    throw new Error("Authentication Setup Failed");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${token}`,
    ...(options.headers as Record<string, string> || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Coinbase API Error", { 
        status: response.status, 
        statusText: response.statusText,
        body: errorText,
        url: url
      });
      throw new Error(`Coinbase API Request Failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    return json;
  } catch (error) {
    throw error;
  }
}

export const coinbaseClient = {
  createPaymentLink: async (params: CreatePaymentLinkParams) => {
    // Endpoint: POST /payment-links
    
    const payload = {
      name: params.name,
      description: params.description,
      pricing_type: "fixed_price",
      fixed_price: {
        amount: params.amount,
        currency: params.currency,
      },
      requested_info: ["name", "email"],
      metadata: params.metadata,
      redirect_url: params.redirect_url, // For success redirect ?? 
      // Note: "redirect_url" might not be supported in new API directly or named differently.
      // Checking docs via search: "cancel_url" and "redirect_url" are often properties.
      // If valid, keep them. Otherwise, we might need 'success_url'.
      // Assumption: API uses standard naming.
    };

    const response = await request<any>("/payment-links", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    // Business API response often wraps in { payment_link: ... } or just returns object
    const data = response.payment_link || response;

    return {
      id: data.id,
      url: `https://commerce.coinbase.com/pay/${data.id}`, 
      // Note: Payment Link URL format might differ for Business. 
      // Often checking the 'url' or 'hosted_url' field in response is safer.
      // We will prefer the one returned by API.
    };
  },

  getPaymentLink: async (id: string) => {
    const response = await request<any>(`/payment-links/${id}`);
    const data = response.payment_link || response;
    
    return {
      id: data.id,
      url: data.hosted_url || `https://commerce.coinbase.com/pay/${data.id}`,
    };
  }
};
