"use server";

import * as settingsActions from "./survey/survey-settings-actions";
import * as lifecycleActions from "./survey/survey-lifecycle-actions";

// Settings Actions
export async function clearSurveyCustomSlugAction(...args: Parameters<typeof settingsActions.clearSurveyCustomSlugAction>) {
  return settingsActions.clearSurveyCustomSlugAction(...args);
}
export async function setSurveyCustomSlugAction(...args: Parameters<typeof settingsActions.setSurveyCustomSlugAction>) {
  return settingsActions.setSurveyCustomSlugAction(...args);
}
export async function updateSurveyAction(...args: Parameters<typeof settingsActions.updateSurveyAction>) {
  return settingsActions.updateSurveyAction(...args);
}

// Lifecycle Actions
export async function confirmSurveyAction(...args: Parameters<typeof lifecycleActions.confirmSurveyAction>) {
  return lifecycleActions.confirmSurveyAction(...args);
}
export async function deactivateSurveyAction(...args: Parameters<typeof lifecycleActions.deactivateSurveyAction>) {
  return lifecycleActions.deactivateSurveyAction(...args);
}
export async function deleteSurveyAction(...args: Parameters<typeof lifecycleActions.deleteSurveyAction>) {
  return lifecycleActions.deleteSurveyAction(...args);
}
export async function duplicateSurveyAction(...args: Parameters<typeof lifecycleActions.duplicateSurveyAction>) {
  return lifecycleActions.duplicateSurveyAction(...args);
}
export async function createSurveyDraftAction(...args: Parameters<typeof lifecycleActions.createSurveyDraftAction>) {
  return lifecycleActions.createSurveyDraftAction(...args);
}
export async function finalizeSurveyCreationAction(...args: Parameters<typeof lifecycleActions.finalizeSurveyCreationAction>) {
  return lifecycleActions.finalizeSurveyCreationAction(...args);
}
export async function publishSurveyAction(...args: Parameters<typeof lifecycleActions.publishSurveyAction>) {
  return lifecycleActions.publishSurveyAction(...args);
}
export async function refreshSurveyAnalyticsAction(...args: Parameters<typeof lifecycleActions.refreshSurveyAnalyticsAction>) {
  return lifecycleActions.refreshSurveyAnalyticsAction(...args);
}
export async function reactivateSurveyAction(...args: Parameters<typeof lifecycleActions.reactivateSurveyAction>) {
  return lifecycleActions.reactivateSurveyAction(...args);
}
export async function setSurveyStatusAction(...args: Parameters<typeof lifecycleActions.setSurveyStatusAction>) {
  return lifecycleActions.setSurveyStatusAction(...args);
}
