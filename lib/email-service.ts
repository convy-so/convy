import { env } from "@/lib/env";
import { enqueueEmail } from "@/lib/queue";
import type { AppLocale } from "@/lib/i18n/config";

/**
 * High-level service for dispatching emails throughout the application.
 * Abstracts the complexity of URL generation, metadata structure, and background queueing.
 */
export const EmailService = {
  /**
   * Sends an invitation/activation email to a student.
   */
  async sendStudentActivationEmail(params: {
    email: string;
    invitationId: string;
    classroomName: string;
    studentName?: string | null;
    locale?: AppLocale;
    customUrl?: string;
  }) {
    const activationUrl = params.customUrl || `${env.NEXT_PUBLIC_APP_URL}/learning/activate?token=${params.invitationId}`;

    return await enqueueEmail({
      type: "student-activation",
      email: params.email.trim().toLowerCase(),
      url: activationUrl,
      name: params.studentName,
      metadata: {
        classroomName: params.classroomName,
        locale: params.locale,
      },
    });
  },

  /**
   * Sends a verification email for new account sign-ups.
   */
  async sendVerificationEmail(params: {
    email: string;
    token: string;
    name?: string | null;
    locale?: AppLocale;
    customUrl?: string;
  }) {
    const verificationUrl = params.customUrl || `${env.NEXT_PUBLIC_APP_URL}/verify-email?token=${params.token}`;

    return await enqueueEmail({
      type: "verification",
      email: params.email.trim().toLowerCase(),
      url: verificationUrl,
      name: params.name,
      metadata: params.locale ? { locale: params.locale } : undefined,
    });
  },

  /**
   * Sends a password reset email.
   */
  async sendPasswordResetEmail(params: {
    email: string;
    token: string;
    name?: string | null;
    locale?: AppLocale;
    customUrl?: string;
  }) {
    const resetUrl = params.customUrl || `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${params.token}`;

    return await enqueueEmail({
      type: "password-reset",
      email: params.email.trim().toLowerCase(),
      url: resetUrl,
      name: params.name,
      metadata: params.locale ? { locale: params.locale } : undefined,
    });
  },

  /**
   * Sends a secondary email verification.
   */
  async sendSecondaryEmailVerification(params: {
    email: string;
    token: string;
    name?: string | null;
    locale?: AppLocale;
  }) {
    const verificationUrl = `${env.NEXT_PUBLIC_APP_URL}/verify-secondary-email?token=${params.token}`;

    return await enqueueEmail({
      type: "secondary-verification",
      email: params.email.trim().toLowerCase(),
      url: verificationUrl,
      name: params.name,
      metadata: params.locale ? { locale: params.locale } : undefined,
    });
  },

  /**
   * Sends a notification when a survey is deleted.
   */
  async sendSurveyDeletedEmail(params: {
    email: string;
    surveyTitle: string;
    deletedBy: string;
    locale?: AppLocale;
  }) {
    return await enqueueEmail({
      type: "survey-deleted",
      email: params.email.trim().toLowerCase(),
      url: env.NEXT_PUBLIC_APP_URL,
      metadata: {
        surveyTitle: params.surveyTitle,
        deletedBy: params.deletedBy,
        locale: params.locale,
      },
    });
  },
};
