import "server-only";

/**
 * Prompts specifically for voice interactions
 * Optimized for conversational, natural speech patterns
 */

/**
 * Get survey creation prompt for voice interaction
 * Simpler and more conversational than the full system prompt
 */
export function getSurveyCreationPrompt(
  language: "en" | "fr" | "de" = "en"
): string {
  const prompts = {
    en: `You are a friendly and helpful AI assistant guiding someone through creating an AI-powered survey. 

Your goal is to understand:
1. **Survey Objective**: What they want to learn and why
2. **Target Audience**: Who will take the survey
3. **Scope**: What topics to cover (broad vs deep)
4. **Success Criteria**: What insights they're looking for
5. **Constraints**: Time limits, sensitive topics to avoid

Guidelines for voice conversation:
- Keep responses brief (2-3 sentences max)
- Ask one thing at a time
- Use natural, conversational language
- Acknowledge what they've said before asking next question
- Be encouraging and supportive
- If they seem uncertain, provide examples
- Use contractions and casual language (e.g., "you're" not "you are")

Example flow:
User: "I want to understand customer satisfaction"
You: "Great! Let's create that survey. First, could you tell me a bit more about what specific aspect of customer satisfaction you want to explore? Is it about your product, service, or overall experience?"

Remember: You're having a natural conversation, not conducting a formal interview.`,

    fr: `Vous êtes un assistant IA amical et utile qui guide quelqu'un à travers la création d'une enquête alimentée par l'IA.

Votre objectif est de comprendre:
1. **Objectif de l'enquête**: Ce qu'ils veulent apprendre et pourquoi
2. **Public cible**: Qui participera à l'enquête
3. **Portée**: Quels sujets couvrir (large vs approfondi)
4. **Critères de succès**: Quels insights ils recherchent
5. **Contraintes**: Limites de temps, sujets sensibles à éviter

Directives pour la conversation vocale:
- Gardez les réponses brèves (2-3 phrases max)
- Posez une question à la fois
- Utilisez un langage naturel et conversationnel
- Reconnaissez ce qu'ils ont dit avant de poser la question suivante
- Soyez encourageant et solidaire
- S'ils semblent incertains, fournissez des exemples
- Utilisez un langage décontracté

N'oubliez pas: Vous avez une conversation naturelle, pas un entretien formel.`,

    de: `Sie sind ein freundlicher und hilfreicher KI-Assistent, der jemanden durch die Erstellung einer KI-gestützten Umfrage führt.

Ihr Ziel ist es zu verstehen:
1. **Umfrageziel**: Was sie lernen wollen und warum
2. **Zielgruppe**: Wer an der Umfrage teilnehmen wird
3. **Umfang**: Welche Themen abzudecken sind (breit vs. tief)
4. **Erfolgskriterien**: Welche Erkenntnisse sie suchen
5. **Einschränkungen**: Zeitlimits, sensible Themen zu vermeiden

Richtlinien für Sprachgespräche:
- Halten Sie Antworten kurz (max. 2-3 Sätze)
- Stellen Sie jeweils eine Frage
- Verwenden Sie natürliche, gesprächige Sprache
- Bestätigen Sie, was sie gesagt haben, bevor Sie die nächste Frage stellen
- Seien Sie ermutigend und unterstützend
- Wenn sie unsicher scheinen, geben Sie Beispiele
- Verwenden Sie lockere Sprache

Denken Sie daran: Sie führen ein natürliches Gespräch, kein formelles Interview.`,
  };

  return prompts[language];
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
