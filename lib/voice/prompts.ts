
import { REQUIRED_INFORMATION } from "../surveys";
import type { CollectedInfo } from "../prompts";

/**
 * Prompts specifically for voice interactions
 * Now unified with text prompts structure while optimized for spoken delivery
 */

/**
 * Get survey creation prompt for voice interaction
 * UNIFIED with text prompts - uses same structure and tracking as text version
 */
export function getSurveyCreationPrompt(
  language: "en" | "fr" | "de" = "en",
  collectedInfo?: CollectedInfo
): string {
  // Default collected info if not provided
  const collected = collectedInfo || {
    objective: false,
    targetAudience: false,
    scope: false,
    successCriteria: false,
    constraints: false,
    hypotheses: false,
    tone: false,
    additionalContext: false,
    requiredQuestions: false,
    metrics: false,
    personalInfo: false,
    subjectDefined: false,
    domainIdentified: false,
  };

  // Build phase and target info (same logic as text version)
  const requiredFields = Object.entries(REQUIRED_INFORMATION)
    .filter(([, info]) => info.required)
    .sort((a, b) => a[1].priority - b[1].priority);

  const uncollectedRequired = requiredFields.filter(
    ([key]) => !collected[key as keyof CollectedInfo]
  );

  const allRequiredCollected = uncollectedRequired.length === 0;

  let currentPhase: string;
  let nextTarget: string;
  let voiceGuidance: string;

  if (!allRequiredCollected) {
    const [nextKey, nextInfo] = uncollectedRequired[0];
    currentPhase = "GATHERING_REQUIRED_INFO";
    nextTarget = `Collect "${nextKey}" - ${nextInfo.description}`;
    voiceGuidance = getVoiceGuidanceForField(nextKey, language);
  } else if (!collected.additionalContext) {
    currentPhase = "ASKING_ADDITIONAL_INFO";
    nextTarget = "Ask if there's any additional context they'd like to add.";
    voiceGuidance =
      "Ask briefly if there's anything else important about their survey.";
  } else if (!collected.metrics) {
    currentPhase = "ASKING_METRICS";
    nextTarget = "Ask about specific metrics to track.";
    voiceGuidance = "Ask what specific things they want to measure or track.";
  } else {
    currentPhase = "READY_FOR_SAMPLE";
    nextTarget = `🚨 CRITICAL - CONVERSATION MUST END NOW 🚨
    
ALL REQUIRED INFORMATION HAS BEEN COLLECTED.

YOU MUST DO EXACTLY THIS:
1. Say: "I have all the information I need to create your survey! Please click the 'Go to Sample Conversations' button to test how the survey will work."
2. Do NOT ask ANY more questions
3. Do NOT offer to help with anything else  
4. Do NOT generate sample questions
5. Keep it BRIEF (this is voice - 1-2 sentences max)

If they continue talking, respond ONLY with: "Please click the button to continue. I can't modify the survey through voice chat."`;
    voiceGuidance = "Confirm you have everything and direct them to click the button. Be brief.";
  }

  const prompts = {
    en: `You are a friendly AI assistant guiding someone through creating a conversational survey.

CURRENT PHASE: ${currentPhase}
NEXT TARGET: ${nextTarget}
VOICE TIP: ${voiceGuidance}

PROGRESS TRACKING:
${requiredFields
  .map(([key, info]) => {
    const status = collected[key as keyof CollectedInfo] ? "✓" : "○";
    return `${status} ${key}: ${info.description}`;
  })
  .join("\n")}

Additional items:
${collected.additionalContext ? "✓" : "○"} additionalContext
${collected.metrics ? "✓" : "○"} metrics
${collected.personalInfo ? "✓" : "○"} personalInfo

VOICE-SPECIFIC GUIDELINES:
- Keep responses SHORT (2-3 sentences max)
- Ask ONE thing at a time
- Use natural contractions ("you're", "we'll", "that's")
- Be warm and encouraging
- Acknowledge what they said before moving on
- If they seem unsure, offer quick examples

CRITICAL - STILL ASK FOLLOW-UPS:
Even though responses should be brief, you MUST dig deeper:
- "Tell me more about that"
- "What makes you say that?"
- "Can you give me a quick example?"
- "Why is that important to you?"

CONTEXT RETENTION:
- Remember everything they've said
- Reference earlier answers: "You mentioned X earlier..."
- Build connections between their responses
- Use their own words

QUALITY CHECKS FOR EACH FIELD:
${requiredFields.map(([key, info]) => `${key}: ${info.qualityChecks.join("; ")}`).join("\n")}

WHEN ALL INFO IS COLLECTED:
1. Ask if they want to collect personal information (email, name, phone, etc.) from survey takers at the end
2. Ask about media (images, audio up to 5 min, video up to 5 min)
3. Give a quick summary of what you understood
4. Explain they can now try sample conversations

Remember: Brief doesn't mean shallow. Get real insights with focused questions.`,

    fr: `Vous êtes un assistant IA amical guidant quelqu'un dans la création d'une enquête conversationnelle.

PHASE ACTUELLE: ${currentPhase}
PROCHAIN OBJECTIF: ${nextTarget}
CONSEIL VOCAL: ${voiceGuidance}

SUIVI DU PROGRÈS:
${requiredFields
  .map(([key, info]) => {
    const status = collected[key as keyof CollectedInfo] ? "✓" : "○";
    return `${status} ${key}: ${info.description}`;
  })
  .join("\n")}

Éléments supplémentaires:
${collected.additionalContext ? "✓" : "○"} contexte additionnel
${collected.metrics ? "✓" : "○"} métriques

DIRECTIVES VOCALES:
- Réponses COURTES (2-3 phrases max)
- Posez UNE question à la fois
- Utilisez un langage naturel et conversationnel
- Soyez chaleureux et encourageant
- Reconnaissez ce qu'ils ont dit avant de continuer

CRITIQUE - POSEZ DES SUIVIS:
Même si les réponses doivent être brèves, vous DEVEZ approfondir:
- "Dites-m'en plus"
- "Qu'est-ce qui vous fait dire ça?"
- "Pouvez-vous me donner un exemple rapide?"

QUAND TOUTES LES INFOS SONT COLLECTÉES:
1. Demandez s'ils veulent ajouter des médias
2. Donnez un bref résumé
3. Expliquez qu'ils peuvent maintenant essayer des conversations échantillons

N'oubliez pas: Bref ne signifie pas superficiel.`,

    de: `Sie sind ein freundlicher KI-Assistent, der jemanden durch die Erstellung einer Konversationsumfrage führt.

AKTUELLE PHASE: ${currentPhase}
NÄCHSTES ZIEL: ${nextTarget}
SPRACHTIPP: ${voiceGuidance}

FORTSCHRITTSVERFOLGUNG:
${requiredFields
  .map(([key, info]) => {
    const status = collected[key as keyof CollectedInfo] ? "✓" : "○";
    return `${status} ${key}: ${info.description}`;
  })
  .join("\n")}

Zusätzliche Elemente:
${collected.additionalContext ? "✓" : "○"} zusätzlicher Kontext
${collected.metrics ? "✓" : "○"} Metriken

SPRACHSPEZIFISCHE RICHTLINIEN:
- Halten Sie Antworten KURZ (max. 2-3 Sätze)
- Stellen Sie EINE Frage pro Mal
- Verwenden Sie natürliche Sprache
- Seien Sie warm und ermutigend
- Bestätigen Sie, was sie gesagt haben

KRITISCH - STELLEN SIE FOLGEFRAGEN:
Auch wenn Antworten kurz sein sollen, müssen Sie tiefer graben:
- "Erzählen Sie mir mehr darüber"
- "Was lässt Sie das sagen?"
- "Können Sie mir ein kurzes Beispiel geben?"

WENN ALLE INFOS GESAMMELT SIND:
1. Fragen Sie nach Medien
2. Geben Sie eine kurze Zusammenfassung
3. Erklären Sie, dass sie jetzt Beispielgespräche ausprobieren können

Denken Sie daran: Kurz bedeutet nicht oberflächlich.`,
  };

  return prompts[language];
}

/**
 * Get voice-specific guidance for collecting each field
 */
function getVoiceGuidanceForField(field: string, language: string): string {
  const guidance: Record<string, Record<string, string>> = {
    objective: {
      en: "Ask what they want to learn and WHY it matters. Get the decision this will inform.",
      fr: "Demandez ce qu'ils veulent apprendre et POURQUOI c'est important.",
      de: "Fragen Sie, was sie lernen wollen und WARUM es wichtig ist.",
    },
    targetAudience: {
      en: "Ask WHO will take the survey and their relationship to the creator.",
      fr: "Demandez QUI participera et leur relation avec le créateur.",
      de: "Fragen Sie, WER teilnehmen wird und ihre Beziehung zum Ersteller.",
    },
    scope: {
      en: "Ask if they want broad coverage or deep dive on specific topics.",
      fr: "Demandez s'ils veulent une couverture large ou approfondie.",
      de: "Fragen Sie, ob sie breite Abdeckung oder tiefes Eintauchen wollen.",
    },
    successCriteria: {
      en: "Ask what kind of answers would be valuable - emotions, behaviors, or opinions?",
      fr: "Demandez quel type de réponses serait précieux.",
      de: "Fragen Sie, welche Art von Antworten wertvoll wäre.",
    },
    constraints: {
      en: "Ask about time limits and any sensitive topics to avoid.",
      fr: "Demandez les limites de temps et les sujets sensibles à éviter.",
      de: "Fragen Sie nach Zeitlimits und sensiblen Themen.",
    },
  };

  return (
    guidance[field]?.[language] ||
    guidance[field]?.en ||
    "Collect this information naturally."
  );
}

/**
 * Get welcome messages for different contexts
 */
export function getVoiceWelcomeMessage(
  context: "survey_creation" | "survey_response",
  language: "en" | "fr" | "de" = "en"
): string {
  const messages = {
    survey_creation: {
      en: "Hi! I'm here to help you create an amazing AI-powered survey. Ready to get started? Tell me what you'd like to learn from your survey.",
      fr: "Bonjour! Je suis là pour vous aider à créer une enquête incroyable alimentée par l'IA. Prêt à commencer? Dites-moi ce que vous aimeriez apprendre de votre enquête.",
      de: "Hallo! Ich bin hier, um Ihnen zu helfen, eine großartige KI-gestützte Umfrage zu erstellen. Bereit anzufangen? Sagen Sie mir, was Sie von Ihrer Umfrage lernen möchten.",
    },
    survey_response: {
      en: "Welcome! Thanks for participating. I'm excited to hear your thoughts. Let's have a conversation!",
      fr: "Bienvenue! Merci de participer. J'ai hâte d'entendre vos réflexions. Ayons une conversation!",
      de: "Willkommen! Danke für Ihre Teilnahme. Ich freue mich, Ihre Gedanken zu hören. Lassen Sie uns ein Gespräch führen!",
    },
  };

  return messages[context][language];
}

/**
 * Get clarification prompts when transcription is unclear
 */
export function getClarificationPrompt(
  language: "en" | "fr" | "de" = "en"
): string {
  const prompts = {
    en: "Sorry, I didn't quite catch that. Could you say that again?",
    fr: "Désolé, je n'ai pas bien compris. Pourriez-vous répéter?",
    de: "Entschuldigung, das habe ich nicht ganz verstanden. Könnten Sie das wiederholen?",
  };

  return prompts[language];
}

/**
 * Get completion messages
 */
export function getCompletionMessage(
  context: "survey_creation" | "survey_response",
  language: "en" | "fr" | "de" = "en"
): string {
  const messages = {
    survey_creation: {
      en: "Perfect! I have everything I need to create your survey. You can now review and finalize it in the dashboard.",
      fr: "Parfait! J'ai tout ce dont j'ai besoin pour créer votre enquête. Vous pouvez maintenant la réviser et la finaliser dans le tableau de bord.",
      de: "Perfekt! Ich habe alles, was ich brauche, um Ihre Umfrage zu erstellen. Sie können sie jetzt im Dashboard überprüfen und finalisieren.",
    },
    survey_response: {
      en: "Thank you so much for sharing your thoughts! Your feedback is really valuable. Have a great day!",
      fr: "Merci beaucoup d'avoir partagé vos réflexions! Vos commentaires sont vraiment précieux. Passez une excellente journée!",
      de: "Vielen Dank, dass Sie Ihre Gedanken geteilt haben! Ihr Feedback ist wirklich wertvoll. Haben Sie einen großartigen Tag!",
    },
  };

  return messages[context][language];
}

/**
 * Get error recovery messages
 */
export function getErrorRecoveryMessage(
  errorType: "transcription" | "synthesis" | "network" | "timeout",
  language: "en" | "fr" | "de" = "en"
): string {
  const messages = {
    transcription: {
      en: "I'm having trouble understanding the audio. Could you try speaking a bit more clearly?",
      fr: "J'ai du mal à comprendre l'audio. Pourriez-vous essayer de parler un peu plus clairement?",
      de: "Ich habe Schwierigkeiten, das Audio zu verstehen. Könnten Sie versuchen, etwas deutlicher zu sprechen?",
    },
    synthesis: {
      en: "Sorry, I'm having trouble with voice output right now. I'll show you the text instead.",
      fr: "Désolé, j'ai des problèmes avec la sortie vocale pour le moment. Je vais vous montrer le texte à la place.",
      de: "Entschuldigung, ich habe gerade Probleme mit der Sprachausgabe. Ich zeige Ihnen stattdessen den Text.",
    },
    network: {
      en: "We're experiencing connection issues. Please check your internet and try again.",
      fr: "Nous rencontrons des problèmes de connexion. Veuillez vérifier votre internet et réessayer.",
      de: "Wir haben Verbindungsprobleme. Bitte überprüfen Sie Ihr Internet und versuchen Sie es erneut.",
    },
    timeout: {
      en: "This is taking longer than expected. Let's try that again.",
      fr: "Cela prend plus de temps que prévu. Essayons à nouveau.",
      de: "Das dauert länger als erwartet. Versuchen wir es noch einmal.",
    },
  };

  return messages[errorType][language];
}

/**
 * Get example responses for common scenarios
 */
export function getExampleResponse(
  scenario: "unclear_goal" | "broad_scope" | "no_audience",
  language: "en" | "fr" | "de" = "en"
): string {
  const examples = {
    unclear_goal: {
      en: "Let me give you some examples: Are you trying to improve a product, understand customer needs, gather employee feedback, or maybe research a new market?",
      fr: "Laissez-moi vous donner quelques exemples: Essayez-vous d'améliorer un produit, de comprendre les besoins des clients, de recueillir les commentaires des employés, ou peut-être de rechercher un nouveau marché?",
      de: "Lassen Sie mich Ihnen einige Beispiele geben: Versuchen Sie, ein Produkt zu verbessern, Kundenbedürfnisse zu verstehen, Mitarbeiterfeedback zu sammeln oder vielleicht einen neuen Markt zu erforschen?",
    },
    broad_scope: {
      en: "That's a big topic! Let's narrow it down. Would you prefer to go deep on one specific aspect, or get a broader overview of multiple areas?",
      fr: "C'est un grand sujet! Réduisons-le. Préférez-vous approfondir un aspect spécifique ou obtenir un aperçu plus large de plusieurs domaines?",
      de: "Das ist ein großes Thema! Lassen Sie es uns eingrenzen. Möchten Sie lieber tief in einen bestimmten Aspekt eintauchen oder einen breiteren Überblick über mehrere Bereiche erhalten?",
    },
    no_audience: {
      en: "Who do you want to survey? For example: customers, employees, students, or a specific demographic group?",
      fr: "Qui voulez-vous interroger? Par exemple: des clients, des employés, des étudiants ou un groupe démographique spécifique?",
      de: "Wen möchten Sie befragen? Zum Beispiel: Kunden, Mitarbeiter, Studenten oder eine bestimmte demografische Gruppe?",
    },
  };

  return examples[scenario][language];
}
