import * as React from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface BaseLayoutProps {
  previewText: string;
  children: React.ReactNode;
}

import { env } from "@/lib/env";

const baseUrl = env.NEXT_PUBLIC_APP_URL;

export const BaseLayout = ({ previewText, children }: BaseLayoutProps) => {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={box}>
            <Img
              src={`${baseUrl}/logo.png`}
              width="40"
              height="40"
              alt="Convyy"
              style={logo}
            />
            
            {children}

            <Hr style={hr} />
            
            <Text style={footer}>
              Convyy — AI-native tutoring intelligence for schools and learning teams.<br />
              <Link href={baseUrl} style={footerLink}>
                getconvy.pro
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  borderRadius: "8px",
  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.05)",
  maxWidth: "600px",
};

const box = {
  padding: "0 48px",
};

const logo = {
  margin: "0 auto",
  marginBottom: "24px",
  display: "block",
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "32px 0 24px",
};

const footer = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  textAlign: "center" as const,
};

const footerLink = {
  color: "#8898aa",
  textDecoration: "underline",
};

export const globalStyles = {
  h1: {
    color: "#1f2937",
    fontSize: "24px",
    fontWeight: "600",
    lineHeight: "32px",
    margin: "0 0 24px",
    textAlign: "center" as const,
  },
  text: {
    color: "#374151",
    fontSize: "16px",
    lineHeight: "24px",
    margin: "0 0 24px",
  },
  buttonContainer: {
    textAlign: "center" as const,
    margin: "32px 0",
  },
  button: {
    backgroundColor: "#111827",
    borderRadius: "6px",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "500",
    textDecoration: "none",
    textAlign: "center" as const,
    display: "inline-block",
    padding: "12px 24px",
  },
  secondaryText: {
    color: "#6b7280",
    fontSize: "14px",
    lineHeight: "24px",
    margin: "0 0 24px",
  },
};
