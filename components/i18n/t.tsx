import { translateUIString, SupportedLanguage } from "@/lib/i18n/ai-translator";
import { getLocale } from "next-intl/server";

interface TProps {
    children: string;
    context?: string;
}

/**
 * Server Component for Dynamic AI-driven Translation
 * Usage: <T>Create Survey</T>
 */
export async function T({ children, context }: TProps) {
    const locale = await getLocale();
    const targetLanguage = locale as SupportedLanguage;

    // If English or no translation needed, return as is
    if (targetLanguage === "en") return <>{children}</>;

    const translated = await translateUIString(children, targetLanguage, context);

    return <>{translated}</>;
}
