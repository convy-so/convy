import { db } from "@/db";
import { subscriptionPlans } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Validates that the paid amount matches expected plan price from the database.
 * This is dynamic - if plan prices change in the DB, validation adapts automatically.
 */
export async function validateCoinbasePrice(
  planId: string,
  interval: string,
  amountUsdCents: number
): Promise<{ isValid: boolean; expected: number; error?: string }> {
  // Fetch the plan from the database
  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId));

  if (!plan) {
    return { isValid: false, expected: 0, error: "Unknown plan" };
  }

  // Get the expected price based on interval
  const expectedAmountCents = interval === "year" 
    ? (plan.priceYearly ?? plan.priceMonthly * 12) 
    : plan.priceMonthly;

  // Free and enterprise plans cannot be purchased via Coinbase
  if (expectedAmountCents === 0) {
    return { isValid: false, expected: 0, error: "Plan not available for purchase" };
  }

  // ✅ FIX: Require exact match (or max 1 cent tolerance for rounding)
  // Amount must be equal to expected plan price, not below
  if (amountUsdCents < expectedAmountCents) {
    return { isValid: false, expected: expectedAmountCents, error: "Amount below required price" };
  }
  // Allow 1 cent tolerance for rounding errors only
  if (amountUsdCents > expectedAmountCents + 1) {
    return { isValid: false, expected: expectedAmountCents, error: "Amount exceeds expected price" };
  }
  
  return { isValid: true, expected: expectedAmountCents };
}

