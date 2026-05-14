import { FolderDetailPageClient } from "@/components/dashboard/folder-detail-page-client";
import {
  getAvailableFolderSurveysData,
  getFolderDetailData,
} from "@/lib/server/app-queries";

export default async function FolderDetailPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;
  const [folder, availableSurveys] = await Promise.all([
    getFolderDetailData(folderId),
    getAvailableFolderSurveysData(),
  ]);

  return (
    <FolderDetailPageClient
      initialFolder={{
        ...folder,
        createdAt: folder.createdAt?.toISOString?.() ?? folder.createdAt,
        updatedAt: folder.updatedAt?.toISOString?.() ?? folder.updatedAt,
        surveys: folder.surveys.map((survey) => ({
          ...survey,
          createdAt: survey.createdAt?.toISOString?.() ?? survey.createdAt,
        })),
      }}
      initialAvailableSurveys={availableSurveys.map((survey) => ({
        id: survey.id,
        title: survey.title,
        currentParticipants: survey.currentParticipants,
        isVoice: survey.isVoice,
      }))}
    />
  );
}
