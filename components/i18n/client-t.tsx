"use client";

import { useState, useEffect } from "react";
import { getClientTranslation } from "@/app/actions/translate";

interface ClientTProps {
    children: string;
    context?: string;
}

/**
 * Client Component for Dynamic AI-driven Translation
 */
export function ClientT({ children, context }: ClientTProps) {
    const [translation, setTranslation] = useState<string>(children);

    useEffect(() => {
        async function load() {
            const result = await getClientTranslation(children, context);
            setTranslation(result);
        }
        load();
    }, [children, context]);

    // Optionally show a subtle skeleton or just the original text while loading
    return <span>{translation}</span>;
}
