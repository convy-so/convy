"use client";

import { useState, useEffect } from "react";
import { getClientTranslation } from "@/app/actions/translate";
import { useLocale } from "next-intl";

interface ClientTProps {
    children: string;
    context?: string;
}

/**
 * Client Component for Dynamic AI-driven Translation
 */
export function ClientT({ children, context }: ClientTProps) {
    const locale = useLocale();
    const isEn = !locale || locale === "en";

    const [translation, setTranslation] = useState<string>(children);
    const [loading, setLoading] = useState(!isEn);

    useEffect(() => {
        if (isEn) return;

        async function load() {
            setLoading(true);
            const result = await getClientTranslation(children, context);
            setTranslation(result);
            setLoading(false);
        }
        load();
    }, [children, context, isEn]);

    if (isEn) {
        return <span>{children}</span>;
    }

    return (
        <span className={loading ? "animate-pulse bg-muted rounded text-transparent select-none inline-block align-bottom" : ""}>
            {loading ? children : translation}
        </span>
    );
}
