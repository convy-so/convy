import {
  lemonSqueezySetup,
  createCheckout,
  getSubscription,
  listPrices,
  listProducts,
  listWebhooks,
  createWebhook,
} from "@lemonsqueezy/lemonsqueezy.js";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

let isConfigured = false;

export const configureLemonSqueezy = () => {
  if (isConfigured) return;
  
  if (!env.LEMONSQUEEZY_API_KEY) {
    logger.error("LEMONSQUEEZY_API_KEY is not set");
    return;
  }

  lemonSqueezySetup({
    apiKey: env.LEMONSQUEEZY_API_KEY,
    onError: (error) => logger.error("Lemon Squeezy API Error", { error }),
  });
  isConfigured = true;
};

export type NewCheckoutOptions = {
    storeId: number | string;
    variantId: number | string;
    checkoutData?: {
        email?: string;
        name?: string;
        custom?: Record<string, string>;
    },
    redirectUrl?: string;
    expiresAt?: string;
    preview?: boolean;
    testMode?: boolean;
}

export const createLemonSqueezyCheckout = async (options: NewCheckoutOptions) => {
    configureLemonSqueezy();
    
    // Store ID is required, usually from env or passed in
    const storeId = options.storeId.toString();
    const variantId = options.variantId.toString();

    const { data, error } = await createCheckout(parseInt(storeId), parseInt(variantId), {
        checkoutData: options.checkoutData,
        productOptions: {
            redirectUrl: options.redirectUrl
        },
        expiresAt: options.expiresAt,
        preview: options.preview,
        testMode: options.testMode
    });

    if (error) {
        throw error;
    }

    return data;
}

export const verifyWebhookSignature = (
    rawBody: string,
    signature: string,
    secret: string
): boolean => {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    const digest = Buffer.from(hmac.update(rawBody).digest('hex'), 'utf8');
    const signatureBuffer = Buffer.from(signature, 'utf8');
    
    return crypto.timingSafeEqual(digest, signatureBuffer);
};
