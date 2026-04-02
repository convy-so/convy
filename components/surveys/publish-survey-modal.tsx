"use client";

import { useState } from "react";
import { X, Loader2, Share2, Copy, Check, Sparkles, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface PublishSurveyModalProps {
  isOpen: boolean;
  onClose: () => void;
  surveyId: string;
  initialTitle?: string;
  initialIsVoice?: boolean;
  onPublished?: (shareUrl: string) => void;
}

export function PublishSurveyModal({
  isOpen,
  onClose,
  surveyId,
  initialTitle = "Untitled Survey",
  initialIsVoice = false,
  onPublished,
}: PublishSurveyModalProps) {
  const t = useTranslations("Survey.PublishModal");
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState("");
  const [isVoice, setIsVoice] = useState(initialIsVoice);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSuggestTitle = async () => {
    setIsGeneratingTitle(true);
    try {
      // TODO: Call AI to suggest title based on survey data
      // For now, just show a placeholder
      await new Promise(resolve => setTimeout(resolve, 1000));
      setTitle("Customer Satisfaction Survey");
      toast.success(t("Toasts.TitleSuggestionGenerated"));
    } catch {
      toast.error(t("Toasts.TitleSuggestionFailed"));
    } finally {
      setIsGeneratingTitle(false);
    }
  };

  const handlePublish = async () => {
    if (!title.trim()) {
      toast.error(t("Toasts.TitleRequired"));
      return;
    }

    setIsPublishing(true);
    try {
      const response = await fetch(`/api/surveys/${surveyId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title, description, isVoice }),
      });

      if (!response.ok) {
        throw new Error("Failed to publish survey");
      }

      const data = await response.json();
      setPublishedUrl(data.shareUrl);
      toast.success(t("Toasts.Success"));
      onPublished?.(data.shareUrl);
    } catch {
      toast.error(t("Toasts.Failed"));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCopyLink = async () => {
    if (!publishedUrl) return;
    
    try {
      await navigator.clipboard.writeText(publishedUrl);
      setCopied(true);
      toast.success(t("Toasts.LinkCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("Toasts.CopyFailed"));
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {publishedUrl ? t("Title.Published") : t("Title.Publish")}
              </h2>
              <p className="text-sm text-gray-500">
                {publishedUrl 
                  ? t("Description.Published") 
                  : t("Description.Draft")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {publishedUrl ? (
          // Published state - show share options
          <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                <p className="text-sm text-green-800 font-medium mb-2">
                  {t("SuccessMessage")}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={publishedUrl}
                    className="flex-1 bg-white border border-green-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <a
                  href={publishedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t("Actions.ViewSurvey")}
                </a>
              <button
                onClick={onClose}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                {t("Actions.Done")}
              </button>
            </div>
          </div>
        ) : (
          // Pre-publish state - show form
          <div className="space-y-4">
            {/* Title input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t("SurveyTitle")}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("Placeholders.Title")}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                />
                <button
                  onClick={handleSuggestTitle}
                  disabled={isGeneratingTitle}
                  className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  title={t("SuggestTitle.Tooltip")}
                >
                  {isGeneratingTitle ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Description input (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t("DescriptionLabel")} <span className="text-gray-400 font-normal">({t("Optional")})</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("Placeholders.Description")}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 resize-none"
              />
            </div>

            {/* Voice Mode Toggle */}
             <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div>
                    <h4 className="font-medium text-gray-900 text-sm mb-0.5">{t("VoiceMode.Title")}</h4>
                    <p className="text-xs text-gray-500">{t("VoiceMode.Description")}</p>
                  </div>
                  <button
                    onClick={() => setIsVoice(!isVoice)}
                    className={cn(
                        "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2",
                        isVoice ? "bg-indigo-600" : "bg-gray-200"
                    )}
                  >
                    <span
                        aria-hidden="true"
                        className={cn(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            isVoice ? "translate-x-4" : "translate-x-0"
                        )}
                    />
                  </button>
              </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                {t("Actions.Cancel")}
              </button>
              <button
                onClick={handlePublish}
                disabled={isPublishing || !title.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("Actions.Publishing")}
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    {t("Actions.Publish")}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
