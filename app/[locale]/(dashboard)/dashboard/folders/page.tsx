import { FoldersPageClient } from "@/components/dashboard/folders-page-client";
import {
  getAvailableFolderSurveysData,
  getFolderListData,
} from "@/lib/server/app-queries";

export default async function FoldersPage() {
  const [folders, availableSurveys] = await Promise.all([
    getFolderListData(),
    getAvailableFolderSurveysData(),
  ]);

  return (
    <FoldersPageClient
      initialFolders={folders.map((folder) => ({
        ...folder,
        createdAt: folder.createdAt?.toISOString?.() ?? folder.createdAt,
        surveys: folder.surveys.map((survey) => ({
          ...survey,
          createdAt: survey.createdAt?.toISOString?.() ?? survey.createdAt,
        })),
      }))}
      initialAvailableSurveys={availableSurveys.map((survey) => ({
        id: survey.id,
        title: survey.title,
        currentParticipants: survey.currentParticipants,
        isVoice: survey.isVoice,
      }))}
    />
  );
}
