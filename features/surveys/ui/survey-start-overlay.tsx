"use client";

import { useState } from "react";
import { Mic, Globe, ArrowRight, ShieldCheck, Check, Loader2, MessageSquare } from "lucide-react";
import { cn } from "@/shared/ui/tailwind-class-utils";

interface SurveyStartOverlayProps {
    onStart: (language: string) => void | Promise<void>;
    initialLanguage: string;
    title: string;
    description: string;
    isVoice?: boolean;
    translations: {
        selectLanguage: string;
        micPermissionDenied: string;
        micConsentTitle: string;
        micConsentDescription: string;
        initializing: string;
        startInterview: string;
    };
}

const LANGUAGES = [
    { code: "en", name: "English", flag: "🇺🇸" },
    { code: "fr", name: "Français", flag: "🇫🇷" },
    { code: "de", name: "Deutsch", flag: "🇩🇪" },
    { code: "es", name: "Español", flag: "🇪🇸" },
    { code: "it", name: "Italiano", flag: "🇮🇹" },
];

export function SurveyStartOverlay({
    onStart,
    initialLanguage,
    title,
    description,
    isVoice = false,
    translations,
}: SurveyStartOverlayProps) {
    const [selectedLanguage, setSelectedLanguage] = useState(initialLanguage);
    const [isRequestingPermission, setIsRequestingPermission] = useState(false);
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const [micConsent, setMicConsent] = useState(false);

    const handleStart = async () => {
        setIsRequestingPermission(true);
        setPermissionError(null);

        if (isVoice) {
            try {
                // Request microphone permission explicitly before starting
                // This ensures we have access before the WebSocket connection initiates
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                // Stop the stream immediately, it was just for the permission check
                stream.getTracks().forEach((track) => track.stop());

                // Permission granted, proceed to start
                await onStart(selectedLanguage);
            } catch {
                setPermissionError(
                    translations.micPermissionDenied ||
                    "Microphone access is required for this survey. Please enable it in your browser settings to continue.",
                );
                setIsRequestingPermission(false);
            }
        } else {
            // Text survey - no permission needed, start directly
            try {
                await onStart(selectedLanguage);
            } catch {
                setIsRequestingPermission(false);
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-white flex items-center justify-center p-4">
            <div className="max-w-md w-full space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                {/* Header */}
                <div className="text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-slate-50 border border-slate-100 mb-2">
                        {isVoice ? (
                            <Mic className="w-10 h-10 text-slate-900" />
                        ) : (
                            <MessageSquare className="w-10 h-10 text-slate-900" />
                        )}
                    </div>
                    <div className="space-y-1">
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                            {title}
                        </h2>
                        <p className="text-slate-500 font-light leading-relaxed text-lg">
                            {description}
                        </p>
                    </div>
                </div>

                {/* Language Selection */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400 px-1">
                        <Globe className="w-3.5 h-3.5" />
                        {translations.selectLanguage || "Select Language"}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {LANGUAGES.map((lang) => (
                            <button
                                key={lang.code}
                                type="button"
                                onClick={() => setSelectedLanguage(lang.code)}
                                className={cn(
                                    "flex items-center justify-between px-5 py-4 rounded-2xl border transition-all duration-300",
                                    selectedLanguage === lang.code
                                        ? "bg-slate-900 border-slate-900 text-white shadow-sm scale-[1.02]"
                                        : "bg-white border-slate-100 text-slate-600 hover:border-slate-200 hover:bg-slate-50"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{lang.flag}</span>
                                    <span className="font-semibold text-sm tracking-tight">{lang.name}</span>
                                </div>
                                {selectedLanguage === lang.code && (
                                    <Check className="w-4 h-4 text-white/70" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Mic Consent & Action Area */}
                <div className="space-y-6 pt-4">
                    {isVoice && (
                        <div
                            onClick={() => setMicConsent(!micConsent)}
                            className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100 cursor-pointer hover:bg-slate-100/50 transition-colors group"
                        >
                            <div className={cn(
                                "w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 transition-all flex items-center justify-center",
                                micConsent ? "bg-slate-900 border-slate-900" : "bg-white border-slate-200 group-hover:border-slate-300"
                            )}>
                                {micConsent && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-slate-900">
                                    {translations.micConsentTitle || "Microphone Access"}
                                </p>
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    {translations.micConsentDescription || "I understand that this survey uses voice recording. I grant permission to use my microphone for the duration of the interview."}
                                </p>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={() => {
                            void handleStart();
                        }}
                        disabled={isRequestingPermission || (isVoice && !micConsent)}
                        className={cn(
                            "w-full py-5 px-8 rounded-3xl font-bold text-lg transition-all duration-500 flex items-center justify-center gap-3 group shadow-sm",
                            (isRequestingPermission || (isVoice && !micConsent))
                                ? "bg-slate-50 text-slate-300 cursor-not-allowed border border-slate-100"
                                : "bg-slate-900 text-white hover:bg-black hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/10 active:scale-95"
                        )}
                    >
                        {isRequestingPermission ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                {translations.initializing || "Initializing..."}
                            </>
                        ) : (
                            <>
                                {translations.startInterview || "Start Survey"}
                                <ArrowRight className="w-5 h-5 opacity-50 group-hover:translate-x-1.5 transition-transform duration-300" />
                            </>
                        )}
                    </button>

                    {permissionError && (
                        <div className="p-5 rounded-2xl bg-red-50 border border-red-100 flex gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <ShieldCheck className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700 leading-relaxed font-medium">
                                {permissionError}
                            </p>
                        </div>
                    )}

                    {isVoice && (
                        <div className="flex items-center justify-center gap-4 text-[10px] text-slate-300 uppercase tracking-widest font-bold">
                            <span className="flex items-center gap-1.5">
                                <div className="w-1 h-1 rounded-full bg-slate-300" />
                                Secure Voice
                            </span>
                            <span className="flex items-center gap-1.5">
                                <div className="w-1 h-1 rounded-full bg-slate-300" />
                                Encrypted
                            </span>
                            <span className="flex items-center gap-1.5">
                                <div className="w-1 h-1 rounded-full bg-slate-300" />
                                Privacy First
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

