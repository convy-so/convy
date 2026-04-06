#!/bin/bash
symbols=(
"_MERGE_THRESHOLD_MS" 
"_isResearching" 
"toggleVoiceMode" 
"addSurveyMediaSchema" 
"updateSurveyMediaSchema" 
"removeSurveyMediaSchema" 
"summarizeErrorForLogs" 
"getSurveyPermissionContext" 
"setChatPlaceholder" 
"TutorMediaMetadata" 
"_includeMedia" 
"getToolPartInput" 
"getToolPartOutput" 
"getLatestRequestMediaUploadPart" 
"inArray" 
"dataType"
)

echo "=== SYMBOL SEARCHES ===" > symbol-search.txt
for sym in "${symbols[@]}"; do
  echo "--- SEARCHING: $sym ---" >> symbol-search.txt
  rg -n "$sym" \
    --glob '!node_modules' \
    --glob '!.next' \
    --glob '!.git' \
    --glob '!symbol-search.txt' \
    --glob '!lints.txt' \
    --glob '!lint-context.txt' \
    >> symbol-search.txt
done
