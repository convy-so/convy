import { Link, Section, Text } from "@react-email/components";
import { BaseLayout, globalStyles } from "./base-layout";

interface PasswordResetEmailProps {
  url: string;
  name?: string | null;
}

export const PasswordResetEmail = ({ url, name }: PasswordResetEmailProps) => {
  const previewText = "Reset your Convyy password";

  return (
    <BaseLayout previewText={previewText}>
      <Text style={globalStyles.h1}>Reset your password</Text>
      
      <Text style={globalStyles.text}>
        Hi {name ?? "there"},
      </Text>
      
      <Text style={globalStyles.text}>
        We received a request to reset the password for your Convyy account. Click the button below to choose a new password.
      </Text>

      <Section style={globalStyles.buttonContainer}>
        <Link style={globalStyles.button} href={url}>
          Reset Password
        </Link>
      </Section>

      <Text style={globalStyles.secondaryText}>
        This link will expire soon. If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.
      </Text>
    </BaseLayout>
  );
};

export default PasswordResetEmail;
