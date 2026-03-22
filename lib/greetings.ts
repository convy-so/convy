/**
 * Time-Adaptive Greeting Generator
 * 
 * Generates context-appropriate greetings for survey conversations based on:
 * - Time of day (morning/afternoon/evening)
 * - Survey type (creation/sample/response)
 * - Language (en/fr/de/es/it)
 * 
 * Greetings are kept simple and welcoming, without asking survey-specific questions.
 * The AI will naturally proceed to ask about objectives based on the system prompt.
 */

export type GreetingType = 'creation' | 'sample' | 'response';
export type SupportedLanguage = 'en' | 'fr' | 'de' | 'es' | 'it';

/**
 * Determine time of day based on hour (0-23)
 */
function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Get current hour in user's timezone, defaulting to UTC if not provided
 */
function getCurrentHour(timezone?: string): number {
  try {
    const now = new Date();
    if (timezone) {
      // Use Intl.DateTimeFormat to get hour in specific timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const hourPart = parts.find(p => p.type === 'hour');
      return hourPart ? parseInt(hourPart.value, 10) : now.getHours();
    }
    return now.getHours();
  } catch {
    // Fallback to UTC if timezone is invalid
    return new Date().getHours();
  }
}

/**
 * Greeting templates organized by language, time, and type
 */
const GREETINGS: Record<
  SupportedLanguage,
  Record<'morning' | 'afternoon' | 'evening', Record<GreetingType, string[]>>
> = {
  en: {
    morning: {
      creation: [
        "Good morning! I'm here to help you create an amazing survey. What exactly would you like to collect today?",
        "Good morning! Ready to design a survey together? What project are we working on?",
        "Good morning! Let's create something great today. What kind of insights are you looking for?",
      ],
      sample: [
        "Good morning! I'm excited to chat with you today.",
        "Good morning! Thanks for trying out this survey.",
        "Good morning! Let's have a great conversation.",
      ],
      response: [
        "Good morning! Thank you for taking the time to participate.",
        "Good morning! I appreciate you sharing your thoughts today.",
        "Good morning! Your input is valuable to us.",
      ],
    },
    afternoon: {
      creation: [
        "Good afternoon! I'm here to help you create an amazing survey. What exactly would you like to collect today?",
        "Hello! Ready to design a survey together? What project are we working on?",
        "Good afternoon! Let's create something great. What kind of insights are you looking for?",
      ],
      sample: [
        "Good afternoon! I'm excited to chat with you today.",
        "Hello! Thanks for trying out this survey.",
        "Good afternoon! Let's have a great conversation.",
      ],
      response: [
        "Good afternoon! Thank you for taking the time to participate.",
        "Hello! I appreciate you sharing your thoughts today.",
        "Good afternoon! Your input is valuable to us.",
      ],
    },
    evening: {
      creation: [
        "Good evening! I'm here to help you create an amazing survey. What exactly would you like to collect today?",
        "Good evening! Ready to design a survey together? What project are we working on?",
        "Hello! Let's create something great. What kind of insights are you looking for?",
      ],
      sample: [
        "Good evening! I'm excited to chat with you today.",
        "Good evening! Thanks for trying out this survey.",
        "Hello! Let's have a great conversation.",
      ],
      response: [
        "Good evening! Thank you for taking the time to participate.",
        "Good evening! I appreciate you sharing your thoughts today.",
        "Hello! Your input is valuable to us.",
      ],
    },
  },
  fr: {
    morning: {
      creation: [
        "Bonjour ! Je suis ici pour vous aider à créer un excellent sondage. Que souhaitez-vous collecter exactement aujourd'hui ?",
        "Bonjour ! Prêt à concevoir un sondage ensemble ? Sur quel projet travaillons-nous ?",
        "Bonjour ! Créons quelque chose de formidable aujourd'hui. Quel type d'informations recherchez-vous ?",
      ],
      sample: [
        "Bonjour ! Je suis ravi de discuter avec vous aujourd'hui.",
        "Bonjour ! Merci d'essayer ce sondage.",
        "Bonjour ! Ayons une excellente conversation.",
      ],
      response: [
        "Bonjour ! Merci de prendre le temps de participer.",
        "Bonjour ! J'apprécie que vous partagiez vos pensées aujourd'hui.",
        "Bonjour ! Votre contribution est précieuse pour nous.",
      ],
    },
    afternoon: {
      creation: [
        "Bon après-midi ! Je suis ici pour vous aider à créer un excellent sondage. Que souhaitez-vous collecter exactement aujourd'hui ?",
        "Bonjour ! Prêt à concevoir un sondage ensemble ? Sur quel projet travaillons-nous ?",
        "Bon après-midi ! Créons quelque chose de formidable. Quel type d'informations recherchez-vous ?",
      ],
      sample: [
        "Bon après-midi ! Je suis ravi de discuter avec vous aujourd'hui.",
        "Bonjour ! Merci d'essayer ce sondage.",
        "Bon après-midi ! Ayons une excellente conversation.",
      ],
      response: [
        "Bon après-midi ! Merci de prendre le temps de participer.",
        "Bonjour ! J'apprécie que vous partagiez vos pensées aujourd'hui.",
        "Bon après-midi ! Votre contribution est précieuse pour nous.",
      ],
    },
    evening: {
      creation: [
        "Bonsoir ! Je suis ici pour vous aider à créer un excellent sondage. Que souhaitez-vous collecter exactement aujourd'hui ?",
        "Bonsoir ! Prêt à concevoir un sondage ensemble ? Sur quel projet travaillons-nous ?",
        "Bonjour ! Créons quelque chose de formidable.",
      ],
      sample: [
        "Bonsoir ! Je suis ravi de discuter avec vous aujourd'hui.",
        "Bonsoir ! Merci d'essayer ce sondage.",
        "Bonjour ! Ayons une excellente conversation.",
      ],
      response: [
        "Bonsoir ! Merci de prendre le temps de participer.",
        "Bonsoir ! J'apprécie que vous partagiez vos pensées aujourd'hui.",
        "Bonjour ! Votre contribution est précieuse pour nous.",
      ],
    },
  },
  de: {
    morning: {
      creation: [
        "Guten Morgen! Ich bin hier, um Ihnen bei der Erstellung einer großartigen Umfrage zu helfen. Was genau möchten Sie heute erfassen?",
        "Guten Morgen! Bereit, gemeinsam eine Umfrage zu gestalten? An welchem Projekt arbeiten wir?",
        "Guten Morgen! Lassen Sie uns heute etwas Großartiges schaffen. Welche Art von Erkenntnissen suchen Sie?",
      ],
      sample: [
        "Guten Morgen! Ich freue mich darauf, heute mit Ihnen zu sprechen.",
        "Guten Morgen! Vielen Dank, dass Sie diese Umfrage ausprobieren.",
        "Guten Morgen! Lassen Sie uns ein tolles Gespräch führen.",
      ],
      response: [
        "Guten Morgen! Vielen Dank, dass Sie sich die Zeit nehmen teilzunehmen.",
        "Guten Morgen! Ich schätze es, dass Sie heute Ihre Gedanken teilen.",
        "Guten Morgen! Ihr Beitrag ist wertvoll für uns.",
      ],
    },
    afternoon: {
      creation: [
        "Guten Tag! Ich bin hier, um Ihnen bei der Erstellung einer großartigen Umfrage zu helfen. Was genau möchten Sie heute erfassen?",
        "Hallo! Bereit, gemeinsam eine Umfrage zu gestalten? An welchem Projekt arbeiten wir?",
        "Guten Tag! Lassen Sie uns etwas Großartiges schaffen. Welche Art von Erkenntnissen suchen Sie?",
      ],
      sample: [
        "Guten Tag! Ich freue mich darauf, heute mit Ihnen zu sprechen.",
        "Hallo! Vielen Dank, dass Sie diese Umfrage ausprobieren.",
        "Guten Tag! Lassen Sie uns ein tolles Gespräch führen.",
      ],
      response: [
        "Guten Tag! Vielen Dank, dass Sie sich die Zeit nehmen teilzunehmen.",
        "Hallo! Ich schätze es, dass Sie heute Ihre Gedanken teilen.",
        "Guten Tag! Ihr Beitrag ist wertvoll für uns.",
      ],
    },
    evening: {
      creation: [
        "Guten Abend! Ich bin hier, um Ihnen bei der Erstellung einer großartigen Umfrage zu helfen. Was genau möchten Sie heute erfassen?",
        "Guten Abend! Bereit, gemeinsam eine Umfrage zu gestalten? An welchem Projekt arbeiten wir?",
        "Hallo! Lassen Sie uns etwas Großartiges schaffen.",
      ],
      sample: [
        "Guten Abend! Ich freue mich darauf, heute mit Ihnen zu sprechen.",
        "Guten Abend! Vielen Dank, dass Sie diese Umfrage ausprobieren.",
        "Hallo! Lassen Sie uns ein tolles Gespräch führen.",
      ],
      response: [
        "Guten Abend! Vielen Dank, dass Sie sich die Zeit nehmen teilzunehmen.",
        "Guten Abend! Ich schätze es, dass Sie heute Ihre Gedanken teilen.",
        "Hallo! Ihr Beitrag ist wertvoll für uns.",
      ],
    },
  },
  es: {
    morning: {
      creation: [
        "¡Buenos días! Estoy aquí para ayudarte a crear una encuesta increíble. ¿Qué te gustaría recolectar exactamente hoy?",
        "¡Buenos días! ¿Listo para diseñar una encuesta juntos? ¿En qué proyecto estamos trabajando?",
        "¡Buenos días! Creemos algo genial hoy. ¿Qué tipo de información estás buscando?",
      ],
      sample: [
        "¡Buenos días! Estoy emocionado de charlar contigo hoy.",
        "¡Buenos días! Gracias por probar esta encuesta.",
        "¡Buenos días! Tengamos una gran conversación.",
      ],
      response: [
        "¡Buenos días! Gracias por tomarte el tiempo de participar.",
        "¡Buenos días! Aprecio que compartas tus pensamientos hoy.",
        "¡Buenos días! Tu aporte es valioso para nosotros.",
      ],
    },
    afternoon: {
      creation: [
        "¡Buenas tardes! Estoy aquí para ayudarte a crear una encuesta increíble. ¿Qué te gustaría recolectar exactamente hoy?",
        "¡Hola! ¿Listo para diseñar una encuesta juntos? ¿En qué proyecto estamos trabajando?",
        "¡Buenas tardes! Creemos algo genial.",
      ],
      sample: [
        "¡Buenas tardes! Estoy emocionado de charlar contigo hoy.",
        "¡Hola! Gracias por probar esta encuesta.",
        "¡Buenas tardes! Tengamos una gran conversación.",
      ],
      response: [
        "¡Buenas tardes! Gracias por tomarte el tiempo de participar.",
        "¡Hola! Aprecio que compartas tus pensamientos hoy.",
        "¡Buenas tardes! Tu aporte es valioso para nosotros.",
      ],
    },
    evening: {
      creation: [
        "¡Buenas noches! Estoy aquí para ayudarte a crear una encuesta increíble. ¿Qué te gustaría recolectar exactamente hoy?",
        "¡Buenas noches! ¿Listo para diseñar una encuesta juntos? ¿En qué proyecto estamos trabajando?",
        "¡Hola! Creemos algo genial.",
      ],
      sample: [
        "¡Buenas noches! Estoy emocionado de charlar contigo hoy.",
        "¡Buenas noches! Gracias por probar esta encuesta.",
        "¡Hola! Tengamos una gran conversación.",
      ],
      response: [
        "¡Buenas noches! Gracias por tomarte el tiempo de participar.",
        "¡Buenas noches! Aprecio que compartas tus pensamientos hoy.",
        "¡Hola! Tu aporte es valioso para nosotros.",
      ],
    },
  },
  it: {
    morning: {
      creation: [
        "Buongiorno! Sono qui per aiutarti a creare un sondaggio straordinario. Cosa vorresti raccogliere esattamente oggi?",
        "Buongiorno! Pronto a progettare un sondaggio insieme? Su quale progetto stiamo lavorando?",
        "Buongiorno! Creiamo qualcosa di fantastico oggi. Che tipo di informazioni stai cercando?",
      ],
      sample: [
        "Buongiorno! Sono entusiasta di chattare con te oggi.",
        "Buongiorno! Grazie per aver provato questo sondaggio.",
        "Buongiorno! Facciamo una bella conversazione.",
      ],
      response: [
        "Buongiorno! Grazie per aver dedicato del tempo a partecipare.",
        "Buongiorno! Apprezzo che tu condivida i tuoi pensieri oggi.",
        "Buongiorno! Il tuo contributo è prezioso per noi.",
      ],
    },
    afternoon: {
      creation: [
        "Buon pomeriggio! Sono qui per aiutarti a creare un sondaggio straordinario. Cosa vorresti raccogliere esattamente oggi?",
        "Ciao! Pronto a progettare un sondaggio insieme? Su quale progetto stiamo lavorando?",
        "Buon pomeriggio! Creiamo qualcosa di fantastico.",
      ],
      sample: [
        "Buon pomeriggio! Sono entusiasta di chattare con te oggi.",
        "Ciao! Grazie per aver provato questo sondaggio.",
        "Buon pomeriggio! Facciamo una bella conversazione.",
      ],
      response: [
        "Buon pomeriggio! Grazie per aver dedicato del tempo a partecipare.",
        "Ciao! Apprezzo che tu condivida i tuoi pensieri oggi.",
        "Buon pomeriggio! Il tuo contributo è prezioso per noi.",
      ],
    },
    evening: {
      creation: [
        "Buonasera! Sono qui per aiutarti a creare un sondaggio straordinario. Cosa vorresti raccogliere esattamente oggi?",
        "Buonasera! Pronto a progettare un sondaggio insieme? Su quale progetto stiamo lavorando?",
        "Ciao! Creiamo qualcosa di fantastico.",
      ],
      sample: [
        "Buonasera! Sono entusiasta di chattare con te oggi.",
        "Buonasera! Grazie per aver provato questo sondaggio.",
        "Ciao! Facciamo una bella conversazione.",
      ],
      response: [
        "Buonasera! Grazie per aver dedicato del tempo a partecipare.",
        "Buonasera! Apprezzo che tu condivida i tuoi pensieri oggi.",
        "Ciao! Il tuo contributo è prezioso per noi.",
      ],
    },
  },
};

/**
 * Generate a time-adaptive greeting for survey conversations
 * 
 * @param type - Type of survey interaction (creation/sample/response)
 * @param language - Language for the greeting (en/fr/de/es/it)
 * @param timezone - Optional IANA timezone (e.g., "America/New_York", "Europe/Paris")
 * @returns A contextually appropriate greeting string
 */
export function getTimeBasedGreeting(
  type: GreetingType,
  language: SupportedLanguage = 'en',
  timezone?: string
): string {
  const hour = getCurrentHour(timezone);
  const timeOfDay = getTimeOfDay(hour);
  
  const greetings = GREETINGS[language]?.[timeOfDay]?.[type] || GREETINGS.en.afternoon.creation;
  
  // Return first greeting (deterministic for consistency)
  // Could randomize with: greetings[Math.floor(Math.random() * greetings.length)]
  return greetings[0];
}
