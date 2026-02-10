
import { REQUIRED_INFORMATION } from "../surveys";
import type { CollectedInfo } from "../prompts";

/**
 * Prompts specifically for voice interactions
 * Unified with text prompts but optimized for spoken delivery
 * CRITICAL: Now properly enforces subject-first logic like text version
 */

/**
 * Get survey creation prompt for voice interaction
 * UNIFIED with text prompts - enforces same subject-first priority
 */
export function getSurveyCreationPrompt(
  language: "en" | "fr" | "de" | "es" | "it" = "en",
  collectedInfo?: CollectedInfo
): string {
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

  const requiredFields = Object.entries(REQUIRED_INFORMATION)
    .filter(([, info]) => info.required)
    .sort((a, b) => a[1].priority - b[1].priority);

  const uncollectedRequired = requiredFields.filter(
    ([key]) => !collected[key as keyof CollectedInfo]
  );

  const allRequiredCollected = uncollectedRequired.length === 0;

  // PRIORITY ORDER (same as text version)
  let phase: string;
  let instruction: string;
  let voiceTip: string;

  // 1. SUBJECT FIRST - Critical fix!
  if (!collected.subjectDefined) {
    phase = "SUBJECT_IDENTIFICATION";
    instruction = "Ask: 'What product or service is this survey about?' Need concrete answer like 'our banking app' not 'a product'.";
    voiceTip = "Be friendly but get the specific product/service name. Ask follow-up if vague.";
  } 
  // 2. Domain classification
  else if (!collected.domainIdentified) {
    phase = "DOMAIN_CLASSIFICATION";
    instruction = "Classify into domain based on subject. Ask if unclear.";
    voiceTip = "Based on what they said, identify if this is healthcare, HR, retail, etc.";
  }
  // 3. Required fields
  else if (!allRequiredCollected) {
    const [nextKey, nextInfo] = uncollectedRequired[0];
    phase = "GATHERING_INFO";
    instruction = `Collect "${nextKey}": ${nextInfo.description}`;
    voiceTip = getVoiceGuidanceForField(nextKey, language);
  }
  // 4. Tone
  else if (!collected.tone) {
    phase = "OPTIONAL_TONE";
    instruction = "Ask about preferred tone: formal, casual, playful, or empathetic.";
    voiceTip = "Quick question - how should the survey feel? Professional or casual?";
  }
  // 5. Metrics
  else if (!collected.metrics) {
    phase = "OPTIONAL_METRICS";
    instruction = "Ask about metrics to track (NPS, satisfaction scores, etc).";
    voiceTip = "Ask if they want to measure specific scores like NPS or satisfaction.";
  }
  // 6. Personal info
  else if (!collected.personalInfo) {
    phase = "OPTIONAL_PERSONAL_INFO";
    instruction = "Ask if they want to collect respondent info (email, name).";
    voiceTip = "Ask if they need contact info from respondents.";
  }
  // 7. Additional context
  else if (!collected.additionalContext) {
    phase = "OPTIONAL_CONTEXT";
    instruction = "Ask if there's anything else to add.";
    voiceTip = "Briefly ask if there's anything else important.";
  }
  // 8. Complete
  else {
    phase = "COMPLETE";
    instruction = "Give 1-sentence summary. Say: 'Click the Go to Sample Conversations button to test your survey.' Stop.";
    voiceTip = "Be brief - just confirm and direct to button.";
  }

  // Build progress tracker
  const progress = [
    `subject:${collected.subjectDefined ? "✓" : "○"}`,
    `domain:${collected.domainIdentified ? "✓" : "○"}`,
    ...requiredFields.map(([k]) => `${k}:${collected[k as keyof CollectedInfo] ? "✓" : "○"}`),
  ].join(" ");

  const languageMap: Record<string, string> = {
    en: "English",
    fr: "French",
    de: "German",
    es: "Spanish",
    it: "Italian",
  };

  return `<role>
You are a friendly voice assistant helping create a conversational survey.
Speak naturally in ${languageMap[language]}. Keep responses to 2-3 sentences max.
</role>

<current_state>
Phase: ${phase}
Progress: ${progress}
</current_state>

<instruction priority="1">
${instruction}
Voice tip: ${voiceTip}
</instruction>

<voice_examples>
These show the right conversational flow for voice:

<example id="subject_first">
User: "I want to create a survey"
You: "Great! First, what specific product or service is this survey about? For example, is it a mobile app, a website, or a service you offer?"
</example>

<example id="clarify_vague">
User: "It's for our app"
You: "Got it, your app. What kind of app is it? Like a banking app, fitness app, or shopping app?"
</example>

<example id="objective">
User: "We want to know why users are canceling"
You: "Understood - you want to understand cancellations. What will you do with those insights? Fixing features, changing pricing, or something else?"
</example>

<example id="complete">
User: "That's everything"
You: "Perfect! I've got what I need - you're surveying premium users of your fitness app to understand cancellations. Click the 'Go to Sample Conversations' button to test it out!"
</example>
</voice_examples>

<voice_rules>
1. ONE question at a time
2. 2-3 sentences MAX per response
3. Use contractions (you're, we'll, that's)
4. Acknowledge before asking next question
5. Give 2 quick examples when asking for info
6. NEVER skip subject identification
</voice_rules>

<validation>
Require specificity:
- "An app" → "What kind of app?"
- "Customers" → "Which customers specifically?"
- "Feedback" → "Feedback about what aspect?"
</validation>

<completion>
When complete: Give 1-sentence summary → Say "Click the button to continue" → Stop asking questions
</completion>`;
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
      es: "Pregunta qué quieren aprender y POR QUÉ es importante.",
      it: "Chiedi cosa vogliono imparare e PERCHÉ è importante.",
    },
    targetAudience: {
      en: "Ask WHO will take the survey and their relationship to the creator.",
      fr: "Demandez QUI participera et leur relation avec le créateur.",
      de: "Fragen Sie, WER teilnehmen wird und ihre Beziehung zum Ersteller.",
      es: "Pregunta QUIÉN participará y su relación con el creador.",
      it: "Chiedi CHI parteciperà e la loro relazione con il creatore.",
    },
    scope: {
      en: "Ask if they want broad coverage or deep dive on specific topics.",
      fr: "Demandez s'ils veulent une couverture large ou approfondie.",
      de: "Fragen Sie, ob sie breite Abdeckung oder tiefes Eintauchen wollen.",
      es: "Pregunta si quieren una cobertura amplia o profundizar en temas específicos.",
      it: "Chiedi se vogliono una copertura ampia o approfondire argomenti specifici.",
    },
    successCriteria: {
      en: "Ask what kind of answers would be valuable - emotions, behaviors, or opinions?",
      fr: "Demandez quel type de réponses serait précieux.",
      de: "Fragen Sie, welche Art von Antworten wertvoll wäre.",
      es: "Pregunta qué tipo de respuestas serían valiosas.",
      it: "Chiedi che tipo di risposte sarebbero preziose.",
    },
    constraints: {
      en: "Ask about time limits and any sensitive topics to avoid.",
      fr: "Demandez les limites de temps et les sujets sensibles à éviter.",
      de: "Fragen Sie nach Zeitlimits und sensiblen Themen.",
      es: "Pregunta sobre límites de tiempo y temas sensibles a evitar.",
      it: "Chiedi limiti di tempo e argomenti sensibili da evitare.",
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
  language: "en" | "fr" | "de" | "es" | "it" = "en"
): string {
  const messages = {
    survey_creation: {
      en: "Hi! I'm here to help you create an amazing AI-powered survey. Ready to get started? Tell me what you'd like to learn from your survey.",
      fr: "Bonjour! Je suis là pour vous aider à créer une enquête incroyable alimentée par l'IA. Prêt à commencer? Dites-moi ce que vous aimeriez apprendre de votre enquête.",
      de: "Hallo! Ich bin hier, um Ihnen zu helfen, eine großartige KI-gestützte Umfrage zu erstellen. Bereit anzufangen? Sagen Sie mir, was Sie von Ihrer Umfrage lernen möchten.",
      es: "¡Hola! Estoy aquí para ayudarte a crear una encuesta increíble impulsada por IA. ¿Listo para comenzar? Dime qué te gustaría aprender de tu encuesta.",
      it: "Ciao! Sono qui per aiutarti a creare un sondaggio incredibile basato sull'IA. Pronto a iniziare? Dimmi cosa vorresti imparare dal tuo sondaggio.",
    },
    survey_response: {
      en: "Welcome! Thanks for participating. I'm excited to hear your thoughts. Let's have a conversation!",
      fr: "Bienvenue! Merci de participer. J'ai hâte d'entendre vos réflexions. Ayons une conversation!",
      de: "Willkommen! Danke für Ihre Teilnahme. Ich freue mich, Ihre Gedanken zu hören. Lassen Sie uns ein Gespräch führen!",
      es: "¡Bienvenido! Gracias por participar. Me emociona escuchar tus opiniones. ¡Conversemos!",
      it: "Benvenuto! Grazie per aver partecipato. Non vedo l'ora di sentire le tue opinioni. Facciamo una conversazione!",
    },
  };

  return messages[context][language];
}

/**
 * Get clarification prompts when transcription is unclear
 */
export function getClarificationPrompt(
  language: "en" | "fr" | "de" | "es" | "it" = "en"
): string {
  const prompts = {
    en: "Sorry, I didn't quite catch that. Could you say that again?",
    fr: "Désolé, je n'ai pas bien compris. Pourriez-vous répéter?",
    de: "Entschuldigung, das habe ich nicht ganz verstanden. Könnten Sie das wiederholen?",
    es: "Lo siento, no entendí bien eso. ¿Podrías decirlo de nuevo?",
    it: "Scusa, non ho capito bene. Potresti ripeterlo?",
  };

  return prompts[language];
}

/**
 * Get completion messages
 */
export function getCompletionMessage(
  context: "survey_creation" | "survey_response",
  language: "en" | "fr" | "de" | "es" | "it" = "en"
): string {
  const messages = {
    survey_creation: {
      en: "Perfect! I have everything I need to create your survey. You can now review and finalize it in the dashboard.",
      fr: "Parfait! J'ai tout ce dont j'ai besoin pour créer votre enquête. Vous pouvez maintenant la réviser et la finaliser dans le tableau de bord.",
      de: "Perfekt! Ich habe alles, was ich brauche, um Ihre Umfrage zu erstellen. Sie können sie jetzt im Dashboard überprüfen und finalisieren.",
      es: "¡Perfecto! Tengo todo lo que necesito para crear tu encuesta. Ahora puedes revisarla y finalizarla en el panel.",
      it: "Perfetto! Ho tutto il necessario per creare il tuo sondaggio. Ora puoi revisionarlo e finalizzarlo nella dashboard.",
    },
    survey_response: {
      en: "Thank you so much for sharing your thoughts! Your feedback is really valuable. Have a great day!",
      fr: "Merci beaucoup d'avoir partagé vos réflexions! Vos commentaires sont vraiment précieux. Passez une excellente journée!",
      de: "Vielen Dank, dass Sie Ihre Gedanken geteilt haben! Ihr Feedback ist wirklich wertvoll. Haben Sie einen großartigen Tag!",
      es: "¡Muchas gracias por compartir tus opiniones! Tus comentarios son muy valiosos. ¡Que tengas un gran día!",
      it: "Grazie mille per aver condiviso le tue opinioni! Il tuo feedback è davvero prezioso. Buona giornata!",
    },
  };

  return messages[context][language];
}

/**
 * Get error recovery messages
 */
export function getErrorRecoveryMessage(
  errorType: "transcription" | "synthesis" | "network" | "timeout",
  language: "en" | "fr" | "de" | "es" | "it" = "en"
): string {
  const messages = {
    transcription: {
      en: "I'm having trouble understanding the audio. Could you try speaking a bit more clearly?",
      fr: "J'ai du mal à comprendre l'audio. Pourriez-vous essayer de parler un peu plus clairement?",
      de: "Ich habe Schwierigkeiten, das Audio zu verstehen. Könnten Sie versuchen, etwas deutlicher zu sprechen?",
      es: "Tengo problemas para entender el audio. ¿Podrías intentar hablar un poco más claro?",
      it: "Ho problemi a capire l'audio. Potresti provare a parlare un po' più chiaramente?",
    },
    synthesis: {
      en: "Sorry, I'm having trouble with voice output right now. I'll show you the text instead.",
      fr: "Désolé, j'ai des problèmes avec la sortie vocale pour le moment. Je vais vous montrer le texte à la place.",
      de: "Entschuldigung, ich habe gerade Probleme mit der Sprachausgabe. Ich zeige Ihnen stattdessen den Text.",
      es: "Lo siento, tengo problemas con la salida de voz en este momento. Te mostraré el texto en su lugar.",
      it: "Scusa, ho problemi con l'uscita vocale in questo momento. Ti mostrerò il testo invece.",
    },
    network: {
      en: "We're experiencing connection issues. Please check your internet and try again.",
      fr: "Nous rencontrons des problèmes de connexion. Veuillez vérifier votre internet et réessayer.",
      de: "Wir haben Verbindungsprobleme. Bitte überprüfen Sie Ihr Internet und versuchen Sie es erneut.",
      es: "Estamos experimentando problemas de conexión. Por favor verifica tu internet e inténtalo de nuevo.",
      it: "Stiamo riscontrando problemi di connessione. Controlla la tua connessione internet e riprova.",
    },
    timeout: {
      en: "This is taking longer than expected. Let's try that again.",
      fr: "Cela prend plus de temps que prévu. Essayons à nouveau.",
      de: "Das dauert länger als erwartet. Versuchen wir es noch einmal.",
      es: "Esto está tomando más tiempo de lo esperado. Intentémoslo de nuevo.",
      it: "Ci sta mettendo più del previsto. Riprovarci.",
    },
  };

  return messages[errorType][language];
}

/**
 * Get example responses for common scenarios
 */
export function getExampleResponse(
  scenario: "unclear_goal" | "broad_scope" | "no_audience",
  language: "en" | "fr" | "de" | "es" | "it" = "en"
): string {
  const examples = {
    unclear_goal: {
      en: "Let me give you some examples: Are you trying to improve a product, understand customer needs, gather employee feedback, or maybe research a new market?",
      fr: "Laissez-moi vous donner quelques exemples: Essayez-vous d'améliorer un produit, de comprendre les besoins des clients, de recueillir les commentaires des employés, ou peut-être de rechercher un nouveau marché?",
      de: "Lassen Sie mich Ihnen einige Beispiele geben: Versuchen Sie, ein Produkt zu verbessern, Kundenbedürfnisse zu verstehen, Mitarbeiterfeedback zu sammeln oder vielleicht einen neuen Markt zu erforschen?",
      es: "Déjame darte algunos ejemplos: ¿Estás tratando de mejorar un producto, entender las necesidades de los clientes o tal vez investigar un nuevo mercado?",
      it: "Fammi fare alcuni esempi: Stai cercando di migliorare un prodotto, capire i bisogni dei clienti o magari ricercare un nuovo mercato?",
    },
    broad_scope: {
      en: "That's a big topic! Let's narrow it down. Would you prefer to go deep on one specific aspect, or get a broader overview of multiple areas?",
      fr: "C'est un grand sujet! Réduisons-le. Préférez-vous approfondir un aspect spécifique ou obtenir un aperçu plus large de plusieurs domaines?",
      de: "Das ist ein großes Thema! Lassen Sie es uns eingrenzen. Möchten Sie lieber tief in einen bestimmten Aspekt eintauchen oder einen breiteren Überblick über mehrere Bereiche erhalten?",
      es: "¡Es un tema muy amplio! Vamos a acotarlo. ¿Preferirías profundizar en un aspecto específico o tener una visión general de varias áreas?",
      it: "È un argomento vasto! Restringiamolo. Preferiresti approfondire un aspetto specifico o avere una panoramica più ampia?",
    },
    no_audience: {
      en: "Who do you want to survey? For example: customers, employees, students, or a specific demographic group?",
      fr: "Qui voulez-vous interroger? Par exemple: des clients, des employés, des étudiants ou un groupe démographique spécifique?",
      de: "Wen möchten Sie befragen? Zum Beispiel: Kunden, Mitarbeiter, Studenten oder eine bestimmte demografische Gruppe?",
      es: "¿A quién quieres encuestar? Por ejemplo: clientes, empleados, estudiantes o un grupo demográfico específico?",
      it: "Chi vuoi intervistare? Per esempio: clienti, dipendenti, studenti o un gruppo demografico specifico?",
    },
  };

  return examples[scenario][language];
}
