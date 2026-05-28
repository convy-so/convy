"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, useRef } from "react";
import { Camera, Image as ImageIcon, Send, X } from "lucide-react";
import { getQuizImageGuidance } from "@/lib/learning/quiz-image-guidance";

export function QuizCard({
  quizId,
  conceptKey,
  questionText,
  acceptsImageUpload,
  onSubmit,
}: {
  quizId: string;
  conceptKey: string;
  questionText: string;
  acceptsImageUpload: boolean;
  onSubmit: (result: { answerText: string; attachments?: FileList }) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageGuidance = acceptsImageUpload ? getQuizImageGuidance() : [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles].slice(0, 3)); // Max 3 images
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim() && files.length === 0) return;

    setSubmitted(true);

    const dataTransfer = new DataTransfer();
    files.forEach((f) => dataTransfer.items.add(f));

    onSubmit({
      answerText: answer,
      attachments: dataTransfer.files.length > 0 ? dataTransfer.files : undefined,
    });
  };

  if (submitted) {
    return (
      <div
        className="w-full max-w-md mx-auto my-4 bg-emerald-50 border border-emerald-100 rounded-2xl p-5 shadow-sm"
        data-quiz-id={quizId}
      >
        <h4 className="text-emerald-800 font-bold text-sm mb-2">Quiz Submitted</h4>
        <p className="text-emerald-600 text-sm">{questionText}</p>
        <div className="mt-3 text-xs text-emerald-500 font-medium italic">
          Waiting for the tutor&apos;s review...
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-md mx-auto my-4 bg-white border border-indigo-100 rounded-3xl overflow-hidden shadow-xl shadow-indigo-100/40"
      data-quiz-id={quizId}
    >
      <div className="bg-indigo-50/50 p-5 border-b border-indigo-50">
        <div className="flex items-center gap-2 mb-3">
          <div className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wider">
            Pop Quiz
          </div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {conceptKey}
          </div>
        </div>
        <p className="text-slate-800 font-medium leading-relaxed">
          {questionText}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {acceptsImageUpload && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
              <div className="mb-2 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-sky-600" />
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                  Photo tips
                </p>
              </div>
              <ul className="space-y-2">
                {imageGuidance.map((item) => (
                  <li key={item.title} className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">{item.title}:</span>{" "}
                    {item.description}
                  </li>
                ))}
              </ul>
            </div>

            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((file, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl border border-slate-200 overflow-hidden bg-slate-50 group">
                    <img
                      src={URL.createObjectURL(file)}
                      alt="upload preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 p-1 bg-slate-900/50 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {files.length < 3 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-bold text-slate-400 hover:text-indigo-500 hover:border-indigo-200 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                Upload notebook photo(s) - up to 3
              </button>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              multiple
              className="hidden"
            />
          </div>
        )}

        <div className="relative">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={acceptsImageUpload ? "Type your answer or short summary here..." : "Type your answer here..."}
            className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-indigo-100 outline-none transition-all resize-none h-24 custom-scrollbar"
          />
        </div>

        <button
          type="submit"
          disabled={!answer.trim() && files.length === 0}
          className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" />
          Submit Answer
        </button>
      </form>
    </div>
  );
}
