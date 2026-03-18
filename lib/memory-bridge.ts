import { ExpertState, CoverageNode } from "./schemas/expert-state";

/**
 * Convy V2 Architecture: The Memory Bridge
 * 
 * Specialized logic for pruning the ExpertState before passing it to the LLM.
 * Prevents token overflow and "context noise" by only showing relevant nodes.
 */
export class MemoryBridge {
  /**
   * Prunes the ExpertState to only include nodes relevant to the current conversation focus.
   */
  static pruneExpertState(state: ExpertState): any {
    const currentTopicId = state.coverageTracker.currentTopicId;
    if (!currentTopicId) return state;

    const allNodesRecursive = this.collectNodesRecursive(state.coverageTracker.nodes);
    const activeNode = allNodesRecursive.find(n => n.id === currentTopicId);
    
    if (!activeNode) return state;

    // 1. Identify "Contextual Nodes":
    const ancestorIds = this.getAncestorIds(activeNode, allNodesRecursive);
    const childrenIds = allNodesRecursive.filter(n => n.parentId === activeNode.id).map(n => n.id);
    const siblingIds = allNodesRecursive.filter(n => n.parentId === activeNode.parentId && n.id !== activeNode.id).map(n => n.id);

    const relevantIds = new Set([
      activeNode.id,
      ...ancestorIds,
      ...childrenIds,
      ...siblingIds
    ]);

    // 2. Filter nodes while preserving some structure (simplified for prompt)
    const prunedNodes = allNodesRecursive.filter(n => relevantIds.has(n.id));

    // 3. Return a pruned state object
    return {
      ...state,
      coverageTracker: {
        ...state.coverageTracker,
        nodes: prunedNodes, // Note: This flattens the tree for the prompt, which is actually easier for the LLM to read if it's pruned.
        _isPruned: true,
        _totalNodesCount: allNodesRecursive.length
      }
    };
  }

  private static getAncestorIds(node: CoverageNode, allNodes: CoverageNode[]): string[] {
    const ancestors: string[] = [];
    let current = node;
    while (current.parentId) {
      const parent = allNodes.find(n => n.id === current.parentId);
      if (!parent) break;
      ancestors.push(parent.id);
      current = parent;
    }
    return ancestors;
  }

  /**
   * Generates a text summary of nodes that have been "met" and pruned away.
   */
  static summarizeOmittedNodes(state: ExpertState): string {
    const metNodes = this.collectNodesRecursive(state.coverageTracker.nodes).filter(n => n.status === "met");
    if (metNodes.length === 0) return "No topics covered yet.";

    return metNodes.map(n => `- ${n.label}: [COVERED]`).join("\n");
  }

  private static collectNodesRecursive(nodes: CoverageNode[]): CoverageNode[] {
    let result: CoverageNode[] = [];
    for (const node of nodes) {
      result.push(node);
      if (node.children) {
        result = result.concat(this.collectNodesRecursive(node.children));
      }
    }
    return result;
  }
}
