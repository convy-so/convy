import { Link, Section, Text } from "@react-email/components";

import { BaseLayout, globalStyles } from "@/shared/email/templates/base-layout";

type ExpertPasswordSetupEmailProps = {
  url: string;
  name?: string | null;
};

export function ExpertPasswordSetupEmail({
  url,
  name,
}: ExpertPasswordSetupEmailProps) {
  return (
    <BaseLayout previewText="Set your password to finish expert onboarding">
      <Text style={globalStyles.h1}>Set your expert password</Text>

      <Text style={globalStyles.text}>Hi {name ?? "there"},</Text>

      <Text style={globalStyles.text}>
        Your email is verified and your expert account is ready for activation.
        Choose a password to finish onboarding and unlock the expert portal.
      </Text>

      <Section style={globalStyles.buttonContainer}>
        <Link style={globalStyles.button} href={url}>
          Set Password
        </Link>
      </Section>

      <Text style={globalStyles.secondaryText}>
        This link expires soon. If you did not request this message, you can
        ignore it.
      </Text>
    </BaseLayout>
  );
}

export default ExpertPasswordSetupEmail;
