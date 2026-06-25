"use client";

import { useState, useRef, useId } from "react";
import {
  CheckCircle2,
  FileAudio,
  FileVideo,
  Image as ImageIcon,
  Loader2,
  Mic,
  Upload,
} from "lucide-react";
import toast from "react-hot-toast";

import { cn } from "@/shared/ui/tailwind-class-utils";
import { useAudioTranscription } from "@/features/surveys/client/hooks/use-audio-transcription";
import { uploadSurveyMediaAction } from "@/app/actions/survey-media";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import type { CreationMediaRecommendation } from "@/features/surveys/server/education/agent-tools";
import type { AppLocale } from "@/shared/i18n/config";

type QueuedFile = {
  id: string;
  file: File;
  description: string;
  learningGoal: string;
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
};

type UploadedMediaItem = {
  id: string;
  url: string;
  type: string;
  description?: string;
  contextForUse?: string;
};

type Props = {
  surveyId: string;
  onAllUploaded: (media: UploadedMediaItem[]) => void;
  onSkip: () => void;
  allowedTypes: string[];
  recommendation: CreationMediaRecommendation;
  rationale?: string;
  aiDescription?: string;
  aiLearningGoal?: string;
  preferVoiceInput?: boolean;
  dictationLanguage: AppLocale;
};

function getFileTypeIcon(file: File) {
  if (file.type.startsWith("image")) return <ImageIcon className="w-4 h-4 text-gray-500" />;
  if (file.type.startsWith("audio")) return <FileAudio className="w-4 h-4 text-gray-500" />;
  if (file.type.startsWith("video")) return <FileVideo className="w-4 h-4 text-gray-500" />;
  return <Upload className="w-4 h-4 text-gray-500" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaUploadFlow({
  surveyId,
  onAllUploaded,
  onSkip,
  allowedTypes,
  recommendation,
  rationale,
  aiDescription,
  aiLearningGoal,
  preferVoiceInput,
  dictationLanguage,
}: Props) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadingAll, setIsUploadingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  const {
    activeTarget: dictationTarget,
    isSupported: speechRecognitionSupported,
    phase: dictationPhase,
    startTranscription,
  } = useAudioTranscription({
    onError: (message) => toast.error(message),
  });

  const makeId = () =>
    `${uid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const acceptAttr = allowedTypes.map((t) => `${t}/*`).join(",");

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const newItems: QueuedFile[] = Array.from(incoming).map((f) => ({
      id: makeId(),
      file: f,
      description: aiDescription ?? "",
      learningGoal: aiLearningGoal ?? "",
      status: "pending",
    }));
    setQueue((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (id: string) =>
    setQueue((prev) => prev.filter((q) => q.id !== id));

  const updateField = (
    id: string,
    field: "description" | "learningGoal",
    value: string,
  ) =>
    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, [field]: value } : q)),
    );

  const canUpload =
    queue.length > 0 &&
    queue.every(
      (q) =>
        q.description.trim().length >= 10 && q.learningGoal.trim().length >= 10,
    );

  const handleUploadAll = async () => {
    if (!canUpload) {
      toast.error(
        "Each file needs a description and learning goal (min 10 characters each).",
      );
      return;
    }
    setIsUploadingAll(true);
    const uploadedMedia: UploadedMediaItem[] = [];

    for (const item of queue) {
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "uploading" } : q)),
      );
      try {
        const formData = new FormData();
        formData.append("surveyId", surveyId);
        formData.append("file", item.file);
        formData.append("description", item.description);
        formData.append("contextForUse", item.learningGoal);

        let type: "image" | "audio" | "video" = "image";
        if (item.file.type.startsWith("audio")) type = "audio";
        else if (item.file.type.startsWith("video")) type = "video";
        formData.append("type", type);

        const result = await uploadSurveyMediaAction(formData);
        if (result.success) {
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, status: "done" } : q)),
          );
          uploadedMedia.push(result.data.media);
        } else {
          const friendlyError = getFriendlyActionError(result.error);
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? { ...q, status: "error", errorMsg: friendlyError }
                : q,
            ),
          );
          toast.error(`Failed: ${friendlyError}`);
        }
      } catch {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: "error", errorMsg: "Unexpected error" }
              : q,
          ),
        );
        toast.error("Upload failed. Please try again.");
      }
    }

    setIsUploadingAll(false);
    if (uploadedMedia.length > 0) {
      toast.success(
        `${uploadedMedia.length} file${uploadedMedia.length > 1 ? "s" : ""} uploaded!`,
      );
      onAllUploaded(uploadedMedia);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-white flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-300"
        style={{
          borderRadius: "2px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.35)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-medium mb-1">
              Survey Media
            </p>
            <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
              Optional Media
            </h2>
          </div>
          <button
            onClick={() => {
              onSkip();
            }}
            disabled={isUploadingAll}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-900 disabled:opacity-40"
          >
            <span className="text-lg leading-none select-none">âœ•</span>
          </button>
        </div>

        {/* AI context hint */}
        {(rationale || aiDescription || aiLearningGoal) && (
          <div
            className="mx-8 mt-5 px-4 py-3 bg-gray-50 border border-gray-200"
            style={{ borderRadius: "2px" }}
          >
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-medium mb-1.5">
              From our conversation
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-800">Recommendation</span>{" "}
              {recommendation === "add_media"
                ? "Adding media could strengthen this study."
                : "Media is optional and not necessary for this study."}
            </p>
            {rationale && (
              <p className="text-sm text-gray-600 mt-0.5">{rationale}</p>
            )}
            {aiDescription && (
              <p className="text-sm text-gray-600">
                <span className="font-medium text-gray-800">What it is:</span>{" "}
                {aiDescription}
              </p>
            )}
            {aiLearningGoal && (
              <p className="text-sm text-gray-600 mt-0.5">
                <span className="font-medium text-gray-800">Goal:</span>{" "}
                {aiLearningGoal}
              </p>
            )}
          </div>
        )}

        {/* Drop Zone */}
        <div className="px-8 pt-5">
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => !isUploadingAll && fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center py-8 gap-3 select-none",
              isDragging
                ? "border-black bg-gray-50"
                : "border-gray-200 hover:border-gray-400 hover:bg-gray-50",
              isUploadingAll && "opacity-40 cursor-not-allowed",
            )}
            style={{ borderRadius: "2px" }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={acceptAttr}
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
              disabled={isUploadingAll}
            />
            <Upload className="w-7 h-7 text-gray-300" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-800">
                {isDragging ? "Drop files here" : "Click or drag files here"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {allowedTypes.join(", ")} â€” up to 100 MB each
              </p>
            </div>
          </div>
        </div>

        {/* File Queue */}
        {queue.length > 0 && (
          <div className="flex-1 overflow-y-auto px-8 mt-5 space-y-4 pb-4">
            {queue.map((item) => (
              <div
                key={item.id}
                className="border border-gray-100 bg-white"
                style={{ borderRadius: "2px" }}
              >
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                  <div
                    className="w-8 h-8 bg-gray-100 flex items-center justify-center flex-shrink-0"
                    style={{ borderRadius: "2px" }}
                  >
                    {item.status === "uploading" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                    ) : item.status === "done" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : item.status === "error" ? (
                      <span className="text-red-500 text-xs font-bold">!</span>
                    ) : (
                      getFileTypeIcon(item.file)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.file.name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatBytes(item.file.size)}
                    </p>
                    {item.errorMsg && (
                      <p className="text-xs text-red-500 mt-0.5">
                        {item.errorMsg}
                      </p>
                    )}
                  </div>
                  {item.status === "pending" && (
                    <button
                      onClick={() => removeFile(item.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-300 hover:text-gray-600 transition-colors flex-shrink-0"
                    >
                      <span className="text-sm leading-none">âœ•</span>
                    </button>
                  )}
                </div>

                {item.status === "pending" && (
                  <div className="px-4 py-3 space-y-2">
                    {(["description", "learningGoal"] as const).map((field) => (
                      <div key={field}>
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <label className="text-[10px] uppercase tracking-[0.15em] text-gray-400 font-medium block">
                            {field === "description" ? "Description" : "Learning Goal"}
                          </label>
                          {preferVoiceInput && speechRecognitionSupported && (
                            <button
                              type="button"
                              onClick={() => {
                                void startTranscription({
                                  target: `${item.id}:${field}`,
                                  language: dictationLanguage,
                                  onTranscript: (transcript) => {
                                    updateField(
                                      item.id,
                                      field,
                                      item[field].trim()
                                        ? `${item[field].trim()} ${transcript}`.trim()
                                        : transcript,
                                    );
                                  },
                                });
                              }}
                              disabled={isUploadingAll}
                              className={cn(
                                "inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] transition-colors",
                                dictationTarget === `${item.id}:${field}`
                                  ? "text-emerald-600"
                                  : "text-gray-400 hover:text-gray-700",
                              )}
                            >
                              {dictationTarget === `${item.id}:${field}` ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Mic className="w-3 h-3" />
                              )}
                              {dictationTarget === `${item.id}:${field}`
                                ? dictationPhase === "recording"
                                  ? "Listening"
                                  : "Transcribing"
                                : "Speak"}
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={item[field]}
                          onChange={(e) =>
                            updateField(item.id, field, e.target.value)
                          }
                          placeholder={
                            field === "description"
                              ? aiDescription || "What is this file? (min 10 chars)"
                              : aiLearningGoal || "What should respondents reflect on? (min 10 chars)"
                          }
                          className="w-full px-3 py-2 border border-gray-200 text-sm text-gray-800 outline-none focus:border-gray-900 transition-colors bg-transparent placeholder-gray-300"
                          style={{ borderRadius: "2px" }}
                          disabled={isUploadingAll}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-gray-100 mt-auto">
          <button
            onClick={() => {
              onSkip();
            }}
            disabled={isUploadingAll}
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40"
          >
            Continue without media
          </button>
          <div className="flex items-center gap-3">
            {queue.length > 0 && !isUploadingAll && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                + Add more
              </button>
            )}
            <button
              onClick={() => {
                void handleUploadAll();
              }}
              disabled={!canUpload || isUploadingAll}
              className={cn(
                "px-6 py-2.5 text-sm font-medium transition-all",
                canUpload && !isUploadingAll
                  ? "bg-black text-white hover:bg-gray-800"
                  : "bg-gray-100 text-gray-300 cursor-not-allowed",
              )}
              style={{ borderRadius: "2px" }}
            >
              {isUploadingAll ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploadingâ€¦
                </span>
              ) : (
                `Upload ${queue.length > 0 ? queue.length + ` file${queue.length > 1 ? "s" : ""}` : ""}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
