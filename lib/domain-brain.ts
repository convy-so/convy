import { ExpertState, CoverageNode } from "@/lib/schemas/expert-state";

/**
 * Convy V2 Architecture: The Domain Brain
 * 
 * Manages the transition and status of the CoverageTracker tree (Research Hierarchy).
 * Responsible for marking topics as complete and identifying the next priority.
 */
export class DomainBrain {
  
  /**
   * Recursively finds a node by ID in the coverage tree
   */
  public findNode(nodes: CoverageNode[], id: string): CoverageNode | undefined {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = this.findNode(node.children, id);
        if (found) return found;
      }
    }
    return undefined;
  }

  /**
   * Updates a specific node's status and logs evidence
   */
  public updateNodeStatus(
    state: ExpertState, 
    nodeId: string, 
    status: "met" | "partial" | "pending",
    evidence?: string
  ): void {
    const node = this.findNode(state.coverageTracker.nodes, nodeId);
    if (!node) return;

    node.status = status;
    if (evidence) {
      node.evidence = evidence;
    }
    
    // Auto-bubbling completion: If all children are met, parent starts to be considered met
    // (Actual logic might vary: some parents require all children, some just a summary)
  }

  /**
   * Finds all topics that are still pending
   */
  public getPendingTopics(state: ExpertState): CoverageNode[] {
    return this._collectPending(state.coverageTracker.nodes);
  }

  private _collectPending(nodes: CoverageNode[]): CoverageNode[] {
    let pending: CoverageNode[] = [];
    for (const node of nodes) {
      if (node.status === "pending") {
        pending.push(node);
      }
      if (node.children) {
        pending = pending.concat(this._collectPending(node.children));
      }
    }
    return pending;
  }

  /**
   * Returns the node currently set as the priority
   */
  public getNextPriorityTopic(state: ExpertState): CoverageNode | undefined {
    const id = state.coverageTracker.currentTopicId;
    if (!id) return undefined;
    return this.findNode(state.coverageTracker.nodes, id);
  }

  /**
   * Identifies the next priority topic based on the tracker's current tree state
   */
  public identifyNextPriority(state: ExpertState): void {
    const pending = this.getPendingTopics(state);
    
    // Simple priority logic: first pending high-priority node
    const highPriority = pending.find(n => n.priority >= 0.8 && n.status === "pending");
    
    if (highPriority) {
      state.coverageTracker.currentTopicId = highPriority.id;
    } else if (pending.length > 0) {
      state.coverageTracker.currentTopicId = pending[0].id;
    } else {
      state.coverageTracker.currentTopicId = null; // All done!
    }
  }

  /**
   * Checks if the entire research objective is satisfied (Global completion)
   */
  public isCoverageComplete(state: ExpertState): boolean {
    const pending = this.getPendingTopics(state);
    // If no more nodes are pending, or if enough high-priority nodes are met
    return pending.length === 0;
  }

  /**
   * Calculates the percentage of nodes that are met (0 to 1)
   */
  public calculateCoverage(state: ExpertState): number {
    const totalNodes = this._countNodes(state.coverageTracker.nodes);
    if (totalNodes === 0) return 0;
    
    const metNodes = this._countMetNodes(state.coverageTracker.nodes);
    return metNodes / totalNodes;
  }

  private _countNodes(nodes: CoverageNode[]): number {
    let count = nodes.length;
    for (const node of nodes) {
      if (node.children) {
        count += this._countNodes(node.children);
      }
    }
    return count;
  }

  private _countMetNodes(nodes: CoverageNode[]): number {
    let count = 0;
    for (const node of nodes) {
      if (node.status === "met") {
        count++;
      }
      if (node.children) {
        count += this._countMetNodes(node.children);
      }
    }
    return count;
  }
}

export const domainBrain = new DomainBrain();
