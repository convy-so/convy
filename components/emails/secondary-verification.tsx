import { Link, Section, Text } from "@react-email/components";
import { BaseLayout, globalStyles } from "./base-layout";

interface SecondaryVerificationProps {
  url: string;
  name?: string | null;
}

export const SecondaryVerificationEmail = ({
  url,
  name,
}: SecondaryVerificationProps) => {
  const previewText = "Verify your team email address for Convyy";

  return (
    <BaseLayout previewText={previewText}>
      <Text style={globalStyles.h1}>Verify your new email</Text>

      <Text style={globalStyles.text}>
        Hi {name ?? "there"},
      </Text>

      <Text style={globalStyles.text}>
        Please confirm this email address to add it as a secondary login method
        to your Convyy account.
      </Text>

      <Section style={globalStyles.buttonContainer}>
        <Link style={globalStyles.button} href={url}>
          Confirm Email Address
        </Link>
      </Section>

      <Text style={globalStyles.secondaryText}>
        If you didn&apos;t request to add this email to an account, you can
        safely ignore this exact email.
      </Text>
    </BaseLayout>
  );
};

export default SecondaryVerificationEmail;
