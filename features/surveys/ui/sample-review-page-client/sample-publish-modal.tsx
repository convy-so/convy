"use client";

import { CheckCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

type Translate = ReturnType<typeof useTranslations>;

export function SamplePublishModal({
  open,
  isConfirming,
  publishTitle,
  publishDescription,
  titlePlaceholder,
  descriptionPlaceholder,
  onClose,
  onTitleChange,
  onDescriptionChange,
  onSubmit,
  t,
}: {
  open: boolean;
  isConfirming: boolean;
  publishTitle: string;
  publishDescription: string;
  titlePlaceholder: string;
  descriptionPlaceholder: string;
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: (event?: React.FormEvent) => void;
  t: Translate;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl animate-in zoom-in-95 duration-200">
        <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-5">
          <h2 className="text-xl font-semibold text-gray-900">
            {t("Actions.Publish")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Review your survey&apos;s details before making it live and shareable.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 p-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Survey Title
            </label>
            <input
              type="text"
              required
              value={publishTitle}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder={titlePlaceholder}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
              disabled={isConfirming}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Description <span className="font-normal text-gray-400">(Optional)</span>
            </label>
            <textarea
              value={publishDescription}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder={descriptionPlaceholder}
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
              disabled={isConfirming}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isConfirming}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
            >
              {t("ConfirmDialog.Cancel")}
            </button>
            <button
              type="submit"
              disabled={!publishTitle.trim() || isConfirming}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-black active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isConfirming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              {t("ConfirmDialog.Confirm")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
