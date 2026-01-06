import { PLAN_PRICES_USD_CENTS } from "./types";

export function validateCoinbasePrice(
  planId: string,
  interval: string,
  amountUsdCents: number
): { isValid: boolean; expected: number; error?: string } {
  let expectedAmountCents = 0;
  
  if (planId === "pro") {
    expectedAmountCents =
      interval === "month"
        ? PLAN_PRICES_USD_CENTS.pro.monthly
        : PLAN_PRICES_USD_CENTS.pro.yearly;
  } else if (planId === "premium") {
    expectedAmountCents =
      interval === "month"
        ? PLAN_PRICES_USD_CENTS.premium.monthly
        : PLAN_PRICES_USD_CENTS.premium.yearly;
  } else {
      return { isValid: false, expected: 0, error: "Unknown plan" };
  }

  // Allow for negligible difference (float precision) but strictly it should be exact for fixed_price
  // Threshold: 5 cents
  if (Math.abs(amountUsdCents - expectedAmountCents) > 5) {
    return { isValid: false, expected: expectedAmountCents, error: "Amount mismatch" };
  }
  
  return { isValid: true, expected: expectedAmountCents };
}
