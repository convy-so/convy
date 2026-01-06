export type PlanId = "free" | "pro" | "premium" | "enterprise";

export type BillingInterval = "month" | "year";

export const PLAN_PRICES_USD_CENTS: Record<
  Exclude<PlanId, "free" | "enterprise">,
  { monthly: number; yearly: number }
> = {
  pro: { monthly: 2900, yearly: 2500 * 12 }, 
  premium: { monthly: 9900, yearly: 8500 * 12 }, 
};
