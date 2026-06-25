"use client";

import { Loader2, X } from "lucide-react";

export function FolderFormModal({
  open,
  title,
  nameLabel,
  namePlaceholder,
  descriptionLabel,
  descriptionPlaceholder,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  name,
  description,
  isPending,
  onClose,
  onNameChange,
  onDescriptionChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  nameLabel: string;
  namePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel: string;
  name: string;
  description: string;
  isPending: boolean;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative mx-4 w-full max-w-md animate-in zoom-in-95 rounded-2xl bg-white shadow-2xl duration-200">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {nameLabel}
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder={namePlaceholder}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {descriptionLabel}
            </label>
            <textarea
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder={descriptionPlaceholder}
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onSubmit}
            disabled={!name.trim() || isPending}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {pendingLabel || confirmLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
