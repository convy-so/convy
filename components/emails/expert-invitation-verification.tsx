import { Link, Section, Text } from "@react-email/components";

import { BaseLayout, globalStyles } from "./base-layout";

type ExpertInvitationVerificationEmailProps = {
  url: string;
  name?: string | null;
};

export function ExpertInvitationVerificationEmail({
  url,
  name,
}: ExpertInvitationVerificationEmailProps) {
  return (
    <BaseLayout previewText="Verify your email to activate your expert invitation">
      <Text style={globalStyles.h1}>Verify your expert invitation</Text>

      <Text style={globalStyles.text}>Hi {name ?? "there"},</Text>

      <Text style={globalStyles.text}>
        An administrator has provisioned your Convyy expert account. Verify your
        email address first, then continue to complete expert onboarding.
      </Text>

      <Section style={globalStyles.buttonContainer}>
        <Link style={globalStyles.button} href={url}>
          Verify Email Address
        </Link>
      </Section>

      <Text style={globalStyles.secondaryText}>
        If you were not expecting expert access, you can ignore this email.
      </Text>
    </BaseLayout>
  );
}

export default ExpertInvitationVerificationEmail;
