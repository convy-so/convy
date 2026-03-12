import { Link, Section, Text } from "@react-email/components";
import { BaseLayout, globalStyles } from "./base-layout";

interface WorkspaceInvitationProps {
  invitedBy: string;
  workspaceName: string;
  inviteLink: string;
  name?: string | null;
}

export const WorkspaceInvitationEmail = ({
  invitedBy,
  workspaceName,
  inviteLink,
  name,
}: WorkspaceInvitationProps) => {
  const previewText = `You've been invited to join ${workspaceName} on Convyy`;

  return (
    <BaseLayout previewText={previewText}>
      <Text style={globalStyles.h1}>You're invited!</Text>
      
      <Text style={globalStyles.text}>
        Hi {name ?? "there"},
      </Text>
      
      <Text style={globalStyles.text}>
        <strong>{invitedBy}</strong> has invited you to join their workspace, <strong>{workspaceName}</strong>, on Convyy.
      </Text>

      <Section style={globalStyles.buttonContainer}>
        <Link style={globalStyles.button} href={inviteLink}>
          Accept Invitation
        </Link>
      </Section>

      <Text style={globalStyles.secondaryText}>
        If you weren't expecting this invitation, you can safely ignore this email.
      </Text>
    </BaseLayout>
  );
};

export default WorkspaceInvitationEmail;
