export class CircuitBreaker {
  private consecutiveFailures = 0;
  private readonly threshold: number;
  private readonly fallbackPhrase: string;
  private lastFailureTime = 0;
  private readonly cooldownMs = 10000; 
  constructor(
    threshold = 2,
    fallbackPhrase = "I'm sorry, I didn't quite catch that. Could you say that again?",
  ) {
    this.threshold = threshold;
    this.fallbackPhrase = fallbackPhrase;
  }

  /**
   * Evaluate if the circuit is open. If open, return the fallback phrase immediately.
   */
  check(): { isOpen: boolean; fallbackPhrase?: string } {
    if (this.consecutiveFailures >= this.threshold) {
      const now = Date.now();
      if (now - this.lastFailureTime < this.cooldownMs) {
        // Circuit is open, return fallback
        console.warn("[CircuitBreaker] Circuit OPEN. Returning fallback.");
        return { isOpen: true, fallbackPhrase: this.fallbackPhrase };
      }
      // Cooldown passed, allow a test call
      console.log("[CircuitBreaker] Circuit HALF-OPEN. Allowing test call.");
    }
    return { isOpen: false };
  }

  recordSuccess() {
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
  }

  recordFailure(error: any) {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    console.error(`[CircuitBreaker] Failure recorded: ${this.consecutiveFailures}/${this.threshold}. Error:`, error);
  }
}
