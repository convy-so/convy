"use client";

import { Suspense } from "react";

import { SurveyRespondPageContent } from "./survey-respond-page-content";
import { SurveyRespondSuspenseFallback } from "./survey-respond-status";

export default function SurveyRespondPage() {
  return (
    <Suspense fallback={<SurveyRespondSuspenseFallback />}>
      <SurveyRespondPageContent />
    </Suspense>
  );
}
