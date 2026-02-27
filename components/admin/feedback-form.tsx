"use client";

import { useState } from "react";
import { submitSurveyFeedback } from "@/app/actions/admin";
import toast from "react-hot-toast";
import { Send, Loader2, Sparkles } from "lucide-react";

interface FeedbackFormProps {
    surveyId: string;
    initialFeedback: string;
}

export function FeedbackForm({ surveyId, initialFeedback }: FeedbackFormProps) {
    const [feedback, setFeedback] = useState(initialFeedback);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!feedback.trim()) {
            toast.error("Feedback cannot be empty");
            return;
        }

        setIsSubmitting(true);
        try {
            await submitSurveyFeedback(surveyId, feedback);
            toast.success("Feedback submitted successfully");
        } catch (error) {
            toast.error("Failed to submit feedback");
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
                <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Enter your expert assessment here..."
                    className="w-full h-64 p-4 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none resize-none placeholder:text-gray-400"
                />
                <div className="absolute bottom-3 right-3 opacity-20">
                    <Sparkles className="w-6 h-6 text-indigo-600" />
                </div>
            </div>

            <button
                type="submit"
                disabled={isSubmitting || feedback === initialFeedback}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-3 px-4 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-indigo-200"
            >
                {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Send className="w-4 h-4" />
                )}
                Submit Analysis
            </button>

            {feedback !== initialFeedback && (
                <p className="text-[10px] text-center text-amber-600 font-medium">
                    You have unsaved changes
                </p>
            )}
        </form>
    );
}
