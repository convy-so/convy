"use server";

import * as readActions from "./survey/survey-read-actions";
import * as settingsActions from "./survey/survey-settings-actions";
import * as lifecycleActions from "./survey/survey-lifecycle-actions";

// Read Actions
export async function getSurveyAction(...args: Parameters<typeof readActions.getSurveyAction>) {
  return readActions.getSurveyAction(...args);
}
export async function getShareableLinkAction(...args: Parameters<typeof readActions.getShareableLinkAction>) {
  return readActions.getShareableLinkAction(...args);
}
export async function getSurveyPublicUrlsAction(...args: Parameters<typeof readActions.getSurveyPublicUrlsAction>) {
  return readActions.getSurveyPublicUrlsAction(...args);
}
export async function getSurveysAction(...args: Parameters<typeof readActions.getSurveysAction>) {
  return readActions.getSurveysAction(...args);
}

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
export async function reactivateSurveyAction(...args: Parameters<typeof lifecycleActions.reactivateSurveyAction>) {
  return lifecycleActions.reactivateSurveyAction(...args);
}
