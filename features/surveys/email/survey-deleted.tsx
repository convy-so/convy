import { Link, Section, Text } from "@react-email/components";
import { BaseLayout, globalStyles } from "@/shared/email/templates/base-layout";

interface SurveyDeletedProps {
  surveyTitle: string;
  deletedBy: string;
  dashboardLabel: string;
  url: string;
  name?: string | null;
}

export const SurveyDeletedEmail = ({
  surveyTitle,
  deletedBy,
  dashboardLabel,
  url,
  name,
}: SurveyDeletedProps) => {
  const previewText = `Survey deleted from ${dashboardLabel}`;

  return (
    <BaseLayout previewText={previewText}>
      <Text style={globalStyles.h1}>Survey Deleted</Text>

      <Text style={globalStyles.text}>
        Hi {name ?? "there"},
      </Text>

      <Text style={globalStyles.text}>
        The survey <strong>&quot;{surveyTitle}&quot;</strong> has been
        permanently deleted from {dashboardLabel}.
      </Text>

      <Text style={globalStyles.text}>
        This action was performed by <strong>{deletedBy}</strong>. All responses
        and associated data have been removed.
      </Text>

      <Section style={globalStyles.buttonContainer}>
        <Link style={globalStyles.button} href={url}>
          Go to Dashboard
        </Link>
      </Section>
    </BaseLayout>
  );
};

export default SurveyDeletedEmail;
