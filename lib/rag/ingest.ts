import { getDb } from "@/db";
import { documentEmbeddings } from "@/db/schema/vectors";
import { surveyConversations, surveyAnalytics } from "@/db/schema/surveys";
import { eq } from "drizzle-orm";
import { generateEmbedding, chunkText } from "./embeddings";
import { nanoid } from "nanoid";
import { generateText } from "ai";
import { flashLiteModel } from "@/lib/ai";

export async function ingestConversation(
  conversationId: string,
  expertState?: any,
): Promise<void> {
  const conversation = await getDb().query.surveyConversations.findFirst({
    where: eq(surveyConversations.id, conversationId),
    with: {
      survey: true,
      insights: true,
    },
  });

  if (!conversation || !conversation.insights) return;

  const organizationId = conversation.survey.organizationId;
  if (!organizationId) {
    console.warn(`[Ingestion] Rejecting conversation ${conversation.id}: Missing organizationId for strict metadata filtering.`);
    return; // Strict metadata validation per spec
  }

  const transcript = (conversation.rawConversation as any[])
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const surveyInfo = `Survey Title: ${conversation.survey.title}\nSurvey Objective: ${conversation.survey.coreObjective || conversation.survey.description || "N/A"}\nParticipant ID: ${conversation.participantId || "Anonymous"}`;

  // 1. Generate and embed Respondent Summary
  try {
    const { text: respondentSummary } = await generateText({
      model: flashLiteModel,
      prompt: `Based on the following survey interview transcript, write a concise summary (3-5 sentences) of this specific respondent's overall perspective, experience, and key feedback.\n\nSurvey Context:\n${surveyInfo}\n\nTranscript:\n${transcript}`,
    });

    const summaryEmbedding = await generateEmbedding(respondentSummary, {
      surveyId: conversation.surveyId,
      organizationId,
    });

    await getDb().insert(documentEmbeddings).values({
      id: nanoid(),
      surveyId: conversation.surveyId,
      sourceType: "response",
      sourceId: conversation.id,
      chunkIndex: -1, 
      content: respondentSummary,
      metadata: {
        chunkType: "respondent_summary",
        organizationId,
        participantId: conversation.participantId,
        date: conversation.createdAt.toISOString(),
        language: conversation.originalLanguage || conversation.survey.language || "en",
      },
      embedding: summaryEmbedding,
    });
  } catch (error) {
    console.error("Failed to generate respondent summary chunk:", error);
  }

  // 2. Process Contextualized QA Pairs
  let lastQuestion = "";
  let chunkIndex = 0;
  for (const msg of conversation.rawConversation as any[]) {
    if (msg.role === "assistant") {
      lastQuestion = msg.content;
    } else if (msg.role === "user") {
      const answer = msg.content;
      
      try {
        const { text: contextPrefix } = await generateText({
          model: flashLiteModel,
          prompt: `Write 1-2 sentences of context to prepend to the respondent's answer so it makes sense in isolation.
Survey: ${conversation.survey.title}
Question asked: "${lastQuestion}"
Respondent's Answer: "${answer}"

Just write the contextual prefix (e.g., "In response to a question about X in the Y survey, the respondent stated that..."). Do not include the actual answer itself, just the prefix.`,
        });

        const contextualizedChunk = `${contextPrefix}\n\nRespondent's Answer: ${answer}`;
        
        const embedding = await generateEmbedding(contextualizedChunk, {
          surveyId: conversation.surveyId,
          organizationId,
        });

        await getDb().insert(documentEmbeddings).values({
          id: nanoid(),
          surveyId: conversation.surveyId,
          sourceType: "response",
          sourceId: conversation.id,
          chunkIndex: chunkIndex++,
          content: contextualizedChunk,
          metadata: {
            chunkType: "qa_pair",
            organizationId,
            question: lastQuestion,
            participantId: conversation.participantId,
            date: conversation.createdAt.toISOString(),
            language: conversation.originalLanguage || conversation.survey.language || "en",
          },
          embedding,
        });
      } catch (error) {
        console.error("Failed to process QA chunk:", error);
      }
    }
  }

  // 3. Ingest ExpertState Findings (Grounded Evidence)
  if (expertState?.coverageTracker?.nodes) {
    const flatNodes: any[] = [];
    const traverse = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.status !== "pending" && node.evidence) {
          flatNodes.push(node);
        }
        if (node.children?.length) traverse(node.children);
      }
    };
    traverse(expertState.coverageTracker.nodes);

    for (const node of flatNodes) {
      try {
        const findingContent = `Research Finding: ${node.label}\nStatus: ${node.status}\nEvidence: ${node.evidence}\nVerbatim Quotes: ${node.verbatimQuotes?.join(" | ") || "None"}`;
        
        const embedding = await generateEmbedding(findingContent, {
          surveyId: conversation.surveyId,
          organizationId,
        });

        await getDb().insert(documentEmbeddings).values({
          id: nanoid(),
          surveyId: conversation.surveyId,
          sourceType: "insight", // Tagged as insight for higher weight in ranking
          sourceId: conversation.id,
          chunkIndex: 5000 + chunkIndex++, // Offset to avoid collision with QA pairs
          content: findingContent,
          metadata: {
            chunkType: "expert_finding",
            nodeId: node.id,
            organizationId,
            participantId: conversation.participantId,
            confidence: node.confidenceScore,
            language: conversation.originalLanguage || conversation.survey.language || "en",
          },
          embedding,
        });
      } catch (error) {
        console.error(`Failed to ingest ExpertState node ${node.id}:`, error);
      }
    }
  }

  // 4. Embed the raw AI-extracted insights
  const insights = JSON.stringify(conversation.insights.insights);
  const insightChunks = chunkText(insights, { maxTokens: 512, overlap: 50 });

  for (let i = 0; i < insightChunks.length; i++) {
    const chunk = insightChunks[i];
    const embedding = await generateEmbedding(chunk, {
      surveyId: conversation.surveyId,
      organizationId: conversation.survey.organizationId || undefined,
    });

    await getDb().insert(documentEmbeddings).values({
      id: nanoid(),
      surveyId: conversation.surveyId,
      sourceType: "insight",
      sourceId: conversation.insights.id,
      chunkIndex: 1000 + i, // Offset
      content: chunk,
      metadata: {
        chunkType: "extracted_insight",
        organizationId,
        conversationId: conversation.id,
        language:
          conversation.originalLanguage || conversation.survey.language || "en",
      },
      embedding,
    });
  }
}

export async function ingestAnalytics(surveyId: string): Promise<void> {
  const analytics = await getDb().query.surveyAnalytics.findFirst({
    where: eq(surveyAnalytics.surveyId, surveyId),
  });

  if (!analytics) return;

  const content = `Target Audience: ${analytics.overallSummary}\n\nMetrics: ${JSON.stringify(analytics.metrics)}`;
  const chunks = chunkText(content, { maxTokens: 512, overlap: 50 });

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await generateEmbedding(chunk, {
      surveyId: surveyId,
    });

    await getDb().insert(documentEmbeddings).values({
      id: nanoid(),
      surveyId: surveyId,
      sourceType: "analytics",
      sourceId: analytics.id,
      chunkIndex: i,
      content: chunk,
      metadata: {
        updatedAt: analytics.lastUpdated.toISOString(),
        language: analytics.generatedLanguage || "en",
      },
      embedding,
    });
  }
}

export async function ingestDocument(
  surveyId: string,
  file: { name: string; content: string; type: string },
): Promise<void> {
  const chunks = chunkText(file.content, { maxTokens: 512, overlap: 50 });

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await generateEmbedding(chunk, {
      surveyId: surveyId,
    });

    await getDb().insert(documentEmbeddings).values({
      id: nanoid(),
      surveyId: surveyId,
      sourceType: "document",
      sourceId: file.name, // Using filename as ID for now
      chunkIndex: i,
      content: chunk,
      metadata: {
        filename: file.name,
        type: file.type,
        language: "en", // Default for direct documents, or could be detected
      },
      embedding,
    });
  }
}
