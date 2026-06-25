import { Link, Section, Text } from "@react-email/components";
import { BaseLayout, globalStyles } from "@/shared/email/templates/base-layout";

interface StudentInvitationEmailProps {
  classroomName: string;
  inviteLink: string;
}

export const StudentInvitationEmail = ({
  classroomName,
  inviteLink,
}: StudentInvitationEmailProps) => {
  const previewText = `You have been invited to join ${classroomName}`;

  return (
    <BaseLayout previewText={previewText}>
      <Text style={globalStyles.h1}>You&apos;ve been invited!</Text>

      <Text style={globalStyles.text}>
        Your teacher has invited you to join <strong>{classroomName}</strong>.
        Use the button below to sign up and access your classroom.
      </Text>

      <Section style={globalStyles.buttonContainer}>
        <Link style={globalStyles.button} href={inviteLink}>
          Join Classroom
        </Link>
      </Section>

      <Text style={globalStyles.secondaryText}>
        If you were not expecting this, you can safely ignore the email.
      </Text>
    </BaseLayout>
  );
};

export default StudentInvitationEmail;
