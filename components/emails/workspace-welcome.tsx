import { Link, Section, Text } from "@react-email/components";
import { BaseLayout, globalStyles } from "./base-layout";

interface WorkspaceWelcomeProps {
  workspaceName: string;
  url: string;
  name?: string | null;
}

export const WorkspaceWelcomeEmail = ({
  workspaceName,
  url,
  name,
}: WorkspaceWelcomeProps) => {
  const previewText = `Welcome to ${workspaceName} on Convyy`;

  return (
    <BaseLayout previewText={previewText}>
      <Text style={globalStyles.h1}>Welcome aboard</Text>

      <Text style={globalStyles.text}>
        Hi {name ?? "there"},
      </Text>

      <Text style={globalStyles.text}>
        You have been successfully added to the <strong>{workspaceName}</strong>
        {" "}workspace on Convyy.
      </Text>

      <Section style={globalStyles.buttonContainer}>
        <Link style={globalStyles.button} href={url}>
          Go to Workspace
        </Link>
      </Section>

      <Text style={globalStyles.secondaryText}>
        We&apos;re excited to have you! Jump right in and start creating
        insights.
      </Text>
    </BaseLayout>
  );
};

export default WorkspaceWelcomeEmail;
