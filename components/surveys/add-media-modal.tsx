"use client";

import { useState, useRef } from "react";
import { X, Upload, FileAudio, FileVideo, Image as ImageIcon, Loader2, Plus } from "lucide-react";
import { uploadSurveyMediaAction } from "@/app/actions/survey-media";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

interface AddMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  surveyId: string;
  onUploaded: (media: any) => void;
}

export function AddMediaModal({ isOpen, onClose, surveyId, onUploaded }: AddMediaModalProps) {
  const t = useTranslations("Survey.AddMedia");
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [context, setContext] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !description || !context) {
       toast.error(t("Toasts.FillAllFields"));
       return;
    }
    
    // Quick validation on lengths to match backend/schema
    if (description.length < 10) {
        toast.error(t("Toasts.DescriptionLength"));
        return;
    }
    if (context.length < 10) {
        toast.error(t("Toasts.ContextLength"));
        return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("surveyId", surveyId);
      formData.append("file", file);
      formData.append("description", description);
      formData.append("contextForUse", context);
      
      let type: "image" | "audio" | "video" = "image";
      if (file.type.startsWith("audio")) type = "audio";
      else if (file.type.startsWith("video")) type = "video";
      
      formData.append("type", type);
      
      // Optional fields - we could add inputs for these later
      // formData.append("contentSummary", description);
      // formData.append("infoToGather", "What are your thoughts on this?");

      const result = await uploadSurveyMediaAction(formData);

      if (result.success) {
        toast.success(t("Toasts.Success"));
        onUploaded(result.data.media);
        
        // Reset and close
        setFile(null);
        setDescription("");
        setContext("");
        onClose();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
       console.error(error);
       toast.error(t("Toasts.Failed"));
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = () => {
      if (!file) return <Upload className="w-8 h-8 text-gray-400" />;
      if (file.type.startsWith("image")) return <ImageIcon className="w-8 h-8 text-purple-600" />;
      if (file.type.startsWith("audio")) return <FileAudio className="w-8 h-8 text-blue-600" />;
      if (file.type.startsWith("video")) return <FileVideo className="w-8 h-8 text-red-600" />;
      return <Upload className="w-8 h-8 text-gray-600" />;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-900">{t("Title")}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
            {/* File Drop Area */}
            <div 
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${file ? 'border-purple-200 bg-purple-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
            >
                <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden" 
                    onChange={handleFileChange}
                    accept="image/*,audio/*,video/*"
                />
                <div className="mb-2">
                    {getFileIcon()}
                </div>
                <p className="text-sm font-medium text-gray-700 text-center">
                    {file ? file.name : t("DropZone.Instructions")}
                </p>
                {file && <p className="text-xs text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>}
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t("DescriptionLabel")}</label>
                <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("Placeholders.Description")}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none text-sm"
                />
                 <p className="text-xs text-gray-400 mt-1">{t("DescriptionHelp")}</p>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t("ContextLabel")}</label>
                <textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder={t("Placeholders.Context")}
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 outline-none text-sm resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">{t("ContextHelp")}</p>
            </div>

            <div className="pt-2 flex gap-3">
                 <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                  >
                    {t("Actions.Cancel")}
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={isUploading || !file}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t("Actions.Uploading")}
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        {t("Actions.AddMedia")}
                      </>
                    )}
                  </button>
            </div>
        </div>
      </div>
    </div>
  );
}
