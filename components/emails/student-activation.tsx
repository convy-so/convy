import { Link, Section, Text } from "@react-email/components";
import { BaseLayout, globalStyles } from "./base-layout";

interface StudentActivationEmailProps {
  studentName: string;
  classroomName: string;
  activationLink: string;
}

export const StudentActivationEmail = ({
  studentName,
  classroomName,
  activationLink,
}: StudentActivationEmailProps) => {
  const previewText = `Activate your learning account for ${classroomName}`;

  return (
    <BaseLayout previewText={previewText}>
      <Text style={globalStyles.h1}>Your learning account is ready</Text>

      <Text style={globalStyles.text}>Hi {studentName},</Text>

      <Text style={globalStyles.text}>
        Your teacher has prepared your account for <strong>{classroomName}</strong>.
        Use the button below to activate it and choose your password.
      </Text>

      <Section style={globalStyles.buttonContainer}>
        <Link style={globalStyles.button} href={activationLink}>
          Activate Account
        </Link>
      </Section>

      <Text style={globalStyles.secondaryText}>
        If you were not expecting this, you can safely ignore the email.
      </Text>
    </BaseLayout>
  );
};

export default StudentActivationEmail;
