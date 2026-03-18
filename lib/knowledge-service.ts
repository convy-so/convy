import { getDb } from "@/db";
import { documentEmbeddings } from "@/db/schema/vectors";
import { generateEmbedding } from "./rag/embeddings";
import { CoverageNode } from "./schemas/expert-state";
import { nanoid } from "nanoid";

/**
 * Convy V2 Architecture: Knowledge Service
 * 
 * Handles the "Long-Term Project Memory" by indexing research findings (nodes)
 * into vector storage for cross-survey synthesis and pattern detection.
 */
export class KnowledgeService {
  /**
   * Indexes a met research node and its evidence as a searchable insight.
   */
  static async indexNodeInsight(surveyId: string, node: CoverageNode): Promise<void> {
    if (node.status !== "met" || !node.evidence) return;

    const content = `Topic: ${node.label}\nFinding: ${node.evidence}`;
    const embedding = await generateEmbedding(content);

    await getDb().insert(documentEmbeddings).values({
      id: nanoid(),
      surveyId,
      sourceType: "insight",
      sourceId: node.id,
      chunkIndex: 0,
      content,
      embedding: embedding as any,
      metadata: {
        nodeLabel: node.label,
        priority: node.priority,
        indexedAt: new Date().toISOString()
      }
    });
  }

  /**
   * Batch indexes all 'met' nodes from an ExpertState.
   */
  static async indexSurveyInsights(surveyId: string, nodes: CoverageNode[]): Promise<void> {
    const flatNodes = this.flattenNodes(nodes).filter(n => n.status === "met" && n.evidence);
    
    for (const node of flatNodes) {
      await this.indexNodeInsight(surveyId, node);
    }
  }

  private static flattenNodes(nodes: CoverageNode[]): CoverageNode[] {
    let result: CoverageNode[] = [];
    for (const node of nodes) {
      result.push(node);
      if (node.children) {
        result = result.concat(this.flattenNodes(node.children));
      }
    }
    return result;
  }
}
