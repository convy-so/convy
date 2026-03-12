import { Link, Section, Text } from "@react-email/components";
import { BaseLayout, globalStyles } from "./base-layout";

interface VerificationEmailProps {
  url: string;
  name?: string | null;
}

export const VerificationEmail = ({ url, name }: VerificationEmailProps) => {
  const previewText = "Verify your email address to continue to Convyy";

  return (
    <BaseLayout previewText={previewText}>
      <Text style={globalStyles.h1}>Verify your email</Text>
      
      <Text style={globalStyles.text}>
        Hi {name ?? "there"},
      </Text>
      
      <Text style={globalStyles.text}>
        Welcome to Convyy! Please confirm your email address to get started creating AI-native surveys.
      </Text>

      <Section style={globalStyles.buttonContainer}>
        <Link style={globalStyles.button} href={url}>
          Verify Email Address
        </Link>
      </Section>

      <Text style={globalStyles.secondaryText}>
        If you didn't request this email, there's nothing to worry about — you can safely ignore it.
      </Text>
    </BaseLayout>
  );
};

export default VerificationEmail;
