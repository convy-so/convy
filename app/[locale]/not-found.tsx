"use client";

import { MoveLeft } from "lucide-react";
import { useTranslations } from "next-intl";

export default function NotFound() {
    const t = useTranslations();
    const tt = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback);

    return (
        <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center space-y-8">
                <div className="space-y-3">
                    <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                        {tt("AppNotFound.Title", "404 - Page Not Found")}
                    </h1>
                    <p className="text-gray-500 text-lg">
                        {tt("AppNotFound.Description", "We've searched every sector, but this page seems to have vanished into digital space.")}
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                    <button
                        onClick={() => window.history.back()}
                        className="flex items-center gap-2 px-8 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    >
                        <MoveLeft className="w-4 h-4" />
                        {tt("AppNotFound.GoBack", "Go Back")}
                    </button>
                </div>

                <p className="text-xs text-gray-400 pt-8 uppercase tracking-[0.2em]">
                    {tt("AppNotFound.Code", "Error Code: PAGE_NOT_FOUND")}
                </p>
            </div>
        </div>
    );
}
