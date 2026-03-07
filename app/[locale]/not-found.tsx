"use client";

import { Link } from "@/i18n/routing";
import { RobotIllustration } from "@/components/ui/robot-illustration";
import { ClientT } from "@/components/i18n/client-t";
import { MoveLeft, Home } from "lucide-react";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center space-y-8">
                <RobotIllustration />

                <div className="space-y-3">
                    <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                        <ClientT>404 - Lost in Translation</ClientT>
                    </h1>
                    <p className="text-gray-500 text-lg">
                        <ClientT>Our robot searched every sector, but this page seems to have vanished into digital space.</ClientT>
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    >
                        <Home className="w-4 h-4" />
                        <ClientT>Back to Dashboard</ClientT>
                    </Link>
                    <button
                        onClick={() => window.history.back()}
                        className="flex items-center gap-2 px-6 py-3 bg-white text-gray-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-all"
                    >
                        <MoveLeft className="w-4 h-4" />
                        <ClientT>Go Back</ClientT>
                    </button>
                </div>

                <p className="text-xs text-gray-400 pt-8 uppercase tracking-[0.2em]">
                    <ClientT>Error Code: PAGE_NOT_FOUND</ClientT>
                </p>
            </div>
        </div>
    );
}
