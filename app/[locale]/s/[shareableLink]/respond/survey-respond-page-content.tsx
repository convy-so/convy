"use client";

import { cn } from "@/shared/ui/tailwind-class-utils";
import { SurveyRespondMessageList } from "./survey-respond-message-list";
import { SurveyRespondInputPanel } from "./survey-respond-input-panel";
import {
  SurveyRespondCompletedState,
  SurveyRespondErrorState,
  SurveyRespondLoadingState,
} from "./survey-respond-status";
import { SurveyRespondHeader } from "./survey-respond-header";
import { SurveyRespondStartOverlay } from "./survey-respond-start-overlay";
import { useSurveyRespondController } from "./use-survey-respond-controller";

export function SurveyRespondPageContent() {
  const {
    conversationId,
    handleCopyResumeLink,
    handleLanguageChange,
    handleRespondentDelete,
    handleRespondentExport,
    handleRetryVoice,
    handleStartSurvey,
    handleSubmit,
    hasRespondentSession,
    hasStarted,
    initError,
    input,
    inputRef,
    isChatLoading,
    isCompleted,
    isInitializing,
    isPrivacyActionLoading,
    isResumeLinkLoading,
    isVoiceMode,
    locale,
    messages,
    messagesEndRef,
    setInput,
    survey,
    toggleVoiceMode,
    translations,
    voiceFallbackNotice,
    voiceSocket,
  } = useSurveyRespondController();

  if (isInitializing) {
    return <SurveyRespondLoadingState translations={translations} />;
  }

  if (initError) {
    const initializationError =
      initError instanceof Error
        ? initError
        : new Error("Failed to load survey");

    return (
      <SurveyRespondErrorState
        initError={initializationError}
        translations={translations}
      />
    );
  }

  if (isCompleted) {
    return (
      <SurveyRespondCompletedState
        translations={translations}
        hasRespondentSession={hasRespondentSession}
        isResumeLinkLoading={isResumeLinkLoading}
        isPrivacyActionLoading={isPrivacyActionLoading}
        onCopyResumeLink={() => void handleCopyResumeLink()}
        onExportData={() => void handleRespondentExport()}
        onDeleteData={() => void handleRespondentDelete()}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center p-0 sm:p-4 font-sans selection:bg-gray-900 selection:text-white">
      <SurveyRespondStartOverlay
        hasStarted={hasStarted}
        isInitializing={isInitializing}
        locale={locale}
        survey={survey}
        onStart={handleStartSurvey}
        translations={translations}
      />

      <div
        className={cn(
          "w-full max-w-5xl h-[100dvh] sm:h-[85vh] bg-white rounded-none shadow-sm flex flex-col overflow-hidden relative transition-opacity duration-500",
          "sm:rounded-3xl sm:border border-gray-200",
          !hasStarted ? "opacity-0" : "opacity-100",
        )}
      >
        <SurveyRespondHeader
          surveyTitle={survey?.title}
          conversationId={conversationId}
          isResumeLinkLoading={isResumeLinkLoading}
          onCopyResumeLink={() => void handleCopyResumeLink()}
          isVoiceAvailable={survey?.isVoice}
          isVoiceMode={isVoiceMode}
          onToggleVoiceMode={toggleVoiceMode}
          translations={translations}
          locale={locale}
          messagesLength={messages.length}
          hasStarted={hasStarted}
          onLanguageChange={handleLanguageChange}
        />

        <main className="flex-1 overflow-y-auto scroll-smooth bg-slate-50/30 relative">
          <SurveyRespondMessageList
            messages={messages}
            messagesEndRef={messagesEndRef}
          />
        </main>

        <SurveyRespondInputPanel
          isVoiceMode={isVoiceMode}
          voiceSocket={voiceSocket}
          input={input}
          setInput={setInput}
          inputRef={inputRef}
          isChatLoading={isChatLoading}
          hasStarted={hasStarted}
          voiceFallbackNotice={voiceFallbackNotice}
          onRetryVoice={handleRetryVoice}
          onSubmit={handleSubmit}
          translations={translations}
        />
      </div>
    </div>
  );
}
