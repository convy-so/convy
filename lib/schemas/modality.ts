import { z } from "zod";

/**
 * Convy V2 Architecture: The Modality Layer
 * 
 * The Modality Layer operates as the primary normalization and routing interface
 * for both creators and respondents. It is a strict translation boundary.
 */

export const modalityEnum = z.enum(["voice", "text"]);
export type Modality = z.infer<typeof modalityEnum>;

export const roleEnum = z.enum(["creator", "respondent"]);
export type Role = z.infer<typeof roleEnum>;

/**
 * The normalized input object from a user (always standardized before reaching the agent)
 */
export const turnObjectSchema = z.object({
  id: z.string().uuid().default(() => crypto.randomUUID()),
  content: z.string(),
  modality: modalityEnum,
  role: roleEnum,
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
  // Internal metadata attached by the modality layer
  metadata: z.record(z.string(), z.any()).optional()
});

export type TurnObject = z.infer<typeof turnObjectSchema>;

/**
 * The normalized Output object from an Agent, before being translated into TTS or markdown
 */
export const agentResponseSchema = z.object({
  content: z.string(),   // The actual spoken or written text response
  thinking: z.string().optional(), // The hidden chain of thought (stripped before output)
  modality: modalityEnum,
  
  // Specific rendering instructions
  renderingOptions: z.object({
    // Voice-specific
    emphasizePunctuation: z.boolean().optional(),
    addBreathPauses: z.boolean().optional(),
    
    // Text-specific
    preserveMarkdown: z.boolean().optional()
  }).optional()
});

export type AgentResponse = z.infer<typeof agentResponseSchema>;

/**
 * Helper function to normalize raw input into a strict TurnObject
 */
export function normalizeInput(
  content: string, 
  modality: Modality, 
  role: Role,
  metadata?: Record<string, any>
): TurnObject {
  return turnObjectSchema.parse({
    content: content.trim(),
    modality,
    role,
    metadata
  });
}
