export class TurnGate {
  private pendingUpdate: Promise<void> | null = null;

  /**
   * Called before a new turn begins.
   * Waits for any pending state update from the previous turn to resolve.
   */
  async awaitPendingState(): Promise<void> {
    if (this.pendingUpdate) {
      try {
        await this.pendingUpdate;
      } catch (error) {
        console.error("[TurnGate] Previous state update failed:", error);
      } finally {
        this.pendingUpdate = null;
      }
    }
  }

  /**
   * Called after a turn finishes to register the new background state update.
   */
  registerPendingState(updatePromise: Promise<void>) {
    this.pendingUpdate = updatePromise;
  }
}

export class TurnGateManager {
  private static gates = new Map<string, TurnGate>();

  static async awaitTurn(conversationId: string): Promise<void> {
    const gate = this.gates.get(conversationId);
    if (gate) {
      await gate.awaitPendingState();
      this.gates.delete(conversationId); // Free memory once awaited
    }
  }

  static registerTurn(conversationId: string, promise: Promise<void>) {
    let gate = this.gates.get(conversationId);
    if (!gate) {
      gate = new TurnGate();
      this.gates.set(conversationId, gate);
    }
    gate.registerPendingState(promise);
  }
}
