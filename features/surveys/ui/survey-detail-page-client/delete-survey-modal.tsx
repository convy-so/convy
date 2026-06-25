"use client";

import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

type Translate = ReturnType<typeof useTranslations>;

export function DeleteSurveyModal({
  open,
  title,
  isDeleting,
  onClose,
  onDelete,
  t,
}: {
  open: boolean;
  title: string;
  isDeleting: boolean;
  onClose: () => void;
  onDelete: () => void;
  t: Translate;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative mx-4 w-full max-w-md animate-in zoom-in-95 overflow-hidden rounded-2xl bg-white shadow-2xl duration-200">
        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h3 className="mb-2 text-xl font-bold text-gray-900">
            {t("DeleteModal.Title")}
          </h3>
          <p className="text-gray-500">
            {t("DeleteModal.Description", { title })}
          </p>
        </div>

        <div className="flex items-center gap-3 bg-gray-50 px-6 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            disabled={isDeleting}
          >
            {t("DeleteModal.Cancel")}
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("DeleteModal.Deleting")}
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                {t("DeleteModal.Delete")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
