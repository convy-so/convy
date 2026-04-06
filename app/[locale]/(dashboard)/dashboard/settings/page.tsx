"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type {
    RetentionPolicySettings,
    WorkspacePrivacyProfileSettings,
} from "@/db/schema";
import {
    User,
    Bell,
    Shield,
    Key,
    Check,
    Loader2,
    Camera,
    AlertCircle,
    Globe,
    CreditCard
} from "lucide-react";
import { usePathname, useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { authClient } from "@/lib/auth-client";
import {
    getActiveWorkspace,
    updateWorkspace,
    updateWorkspaceLocalizationSettingsAction,
    updateWorkspacePrivacyProfileAction,
} from "@/app/actions/workspace";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { updateUserLanguage } from "@/app/actions/translate";
import { useRealtime, type RealtimeEvent } from "@/hooks/use-realtime";
import {
    appLocaleLabels,
    isAppLocale,
    type AppLocale,
    type WorkspaceLocaleSettings,
} from "@/lib/i18n/config";
import { clientEnv } from "@/lib/env.client";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWorkspaceLocalizationInput(
    value: unknown,
    fallback: WorkspaceLocaleSettings,
): WorkspaceLocaleSettings {
    if (!isRecord(value)) {
        return fallback;
    }

    return {
        defaultUiLocale: isAppLocale(value.defaultUiLocale)
            ? value.defaultUiLocale
            : fallback.defaultUiLocale,
        defaultContentLocale: isAppLocale(value.defaultContentLocale)
            ? value.defaultContentLocale
            : fallback.defaultContentLocale,
        emailLocale: isAppLocale(value.emailLocale)
            ? value.emailLocale
            : fallback.emailLocale,
        allowedLocales: Array.isArray(value.allowedLocales)
            ? (() => {
                const locales = value.allowedLocales.filter(isAppLocale);
                return locales.length > 0 ? locales : fallback.allowedLocales;
            })()
            : fallback.allowedLocales,
        autoTranslateGeneratedContent:
            typeof value.autoTranslateGeneratedContent === "boolean"
                ? value.autoTranslateGeneratedContent
                : fallback.autoTranslateGeneratedContent,
    };
}

const localeOptions: Array<{ code: AppLocale; name: string; flag: string }> = [
    { code: "en", name: appLocaleLabels.en, flag: "🇺🇸" },
    { code: "fr", name: appLocaleLabels.fr, flag: "🇫🇷" },
    { code: "de", name: appLocaleLabels.de, flag: "🇩🇪" },
    { code: "es", name: appLocaleLabels.es, flag: "🇪🇸" },
    { code: "it", name: appLocaleLabels.it, flag: "🇮🇹" },
];

const initialNotifications = {
    emailNewResponse: true,
    emailWeeklySummary: true,
    emailTeamUpdates: false,
    pushNewResponse: true,
    pushSurveyComplete: true,
};

type NotificationSettings = typeof initialNotifications;
type NotificationChannel = "email" | "push";
type NotificationOptionKey = "NewResponse" | "WeeklySummary" | "TeamUpdates" | "SurveyComplete";

const notificationStateKeyMap: Record<NotificationChannel, Partial<Record<NotificationOptionKey, keyof NotificationSettings>>> = {
    email: {
        NewResponse: "emailNewResponse",
        WeeklySummary: "emailWeeklySummary",
        TeamUpdates: "emailTeamUpdates",
    },
    push: {
        NewResponse: "pushNewResponse",
        SurveyComplete: "pushSurveyComplete",
    },
};

type WorkspacePrivacyState = {
    settings: WorkspacePrivacyProfileSettings;
    retention: RetentionPolicySettings;
    missingItems: string[];
    runtimeEnabledProcessors: string[];
    runtimeProcessorViolations: string[];
};

type ActiveWorkspaceState = {
    id: string;
    name: string;
    slug: string;
    role: string;
    logo?: string | null;
    plan?: string | null;
    localization: WorkspaceLocaleSettings;
    privacy: WorkspacePrivacyState;
};

const defaultWorkspacePrivacySettings: WorkspacePrivacyProfileSettings = {
    controllerIdentity: null,
    controllerContactName: null,
    controllerContactEmail: null,
    dpoContactEmail: null,
    privacyNoticeUrl: null,
    privacyNoticeText: null,
    processorRoleAcknowledged: false,
    enabledProcessors: [],
    lawfulBasisDeclarations: [],
    dataResidencyMode: "eea_only",
    audienceAgeMode: "unset",
};

const defaultRetentionPolicySettings: RetentionPolicySettings = {
    rawTranscriptDays: 30,
    voiceTelemetryDays: 7,
    derivedAnalyticsDays: 180,
    studentInteractionDays: 90,
    privacyRequestDays: 365,
};

const defaultWorkspacePrivacyState: WorkspacePrivacyState = {
    settings: defaultWorkspacePrivacySettings,
    retention: defaultRetentionPolicySettings,
    missingItems: [],
    runtimeEnabledProcessors: [],
    runtimeProcessorViolations: [],
};

function normalizeWorkspacePrivacyInput(
    value: unknown,
    fallback: WorkspacePrivacyProfileSettings,
): WorkspacePrivacyProfileSettings {
    if (!isRecord(value)) {
        return fallback;
    }

    const lawfulBasisDeclarations = Array.isArray(value.lawfulBasisDeclarations)
        ? value.lawfulBasisDeclarations.flatMap((item) => {
            if (!isRecord(item) || typeof item.purpose !== "string" || typeof item.lawfulBasis !== "string") {
                return [];
            }

            return [{
                purpose: item.purpose,
                lawfulBasis: item.lawfulBasis,
                notes: typeof item.notes === "string" ? item.notes : null,
            }];
        })
        : fallback.lawfulBasisDeclarations;

    return {
        controllerIdentity:
            typeof value.controllerIdentity === "string" || value.controllerIdentity === null
                ? value.controllerIdentity
                : fallback.controllerIdentity,
        controllerContactName:
            typeof value.controllerContactName === "string" || value.controllerContactName === null
                ? value.controllerContactName
                : fallback.controllerContactName,
        controllerContactEmail:
            typeof value.controllerContactEmail === "string" || value.controllerContactEmail === null
                ? value.controllerContactEmail
                : fallback.controllerContactEmail,
        dpoContactEmail:
            typeof value.dpoContactEmail === "string" || value.dpoContactEmail === null
                ? value.dpoContactEmail
                : fallback.dpoContactEmail,
        privacyNoticeUrl:
            typeof value.privacyNoticeUrl === "string" || value.privacyNoticeUrl === null
                ? value.privacyNoticeUrl
                : fallback.privacyNoticeUrl,
        privacyNoticeText:
            typeof value.privacyNoticeText === "string" || value.privacyNoticeText === null
                ? value.privacyNoticeText
                : fallback.privacyNoticeText,
        processorRoleAcknowledged:
            typeof value.processorRoleAcknowledged === "boolean"
                ? value.processorRoleAcknowledged
                : fallback.processorRoleAcknowledged,
        enabledProcessors: Array.isArray(value.enabledProcessors)
            ? value.enabledProcessors.filter((item): item is string => typeof item === "string")
            : fallback.enabledProcessors,
        lawfulBasisDeclarations,
        dataResidencyMode:
            value.dataResidencyMode === "approved_transfers" || value.dataResidencyMode === "eea_only"
                ? value.dataResidencyMode
                : fallback.dataResidencyMode,
        audienceAgeMode:
            value.audienceAgeMode === "adult_only" ||
                value.audienceAgeMode === "includes_minors" ||
                value.audienceAgeMode === "unset"
                ? value.audienceAgeMode
                : fallback.audienceAgeMode,
    };
}

function normalizeRetentionInput(
    value: unknown,
    fallback: RetentionPolicySettings,
): RetentionPolicySettings {
    if (!isRecord(value)) {
        return fallback;
    }

    const readDays = (nextValue: unknown, fallbackValue: number) =>
        typeof nextValue === "number" && Number.isFinite(nextValue) && nextValue > 0
            ? Math.round(nextValue)
            : fallbackValue;

    return {
        rawTranscriptDays: readDays(value.rawTranscriptDays, fallback.rawTranscriptDays),
        voiceTelemetryDays: readDays(value.voiceTelemetryDays, fallback.voiceTelemetryDays),
        derivedAnalyticsDays: readDays(value.derivedAnalyticsDays, fallback.derivedAnalyticsDays),
        studentInteractionDays: readDays(value.studentInteractionDays, fallback.studentInteractionDays),
        privacyRequestDays: readDays(value.privacyRequestDays, fallback.privacyRequestDays),
    };
}

function normalizeWorkspacePrivacyState(
    value: unknown,
    fallback: WorkspacePrivacyState = defaultWorkspacePrivacyState,
): WorkspacePrivacyState {
    if (!isRecord(value)) {
        return fallback;
    }

    return {
        settings: normalizeWorkspacePrivacyInput(
            value.settings,
            fallback.settings,
        ),
        retention: normalizeRetentionInput(
            value.retention,
            fallback.retention,
        ),
        missingItems: Array.isArray(value.missingItems)
            ? value.missingItems.filter((item): item is string => typeof item === "string")
            : fallback.missingItems,
        runtimeEnabledProcessors: Array.isArray(value.runtimeEnabledProcessors)
            ? value.runtimeEnabledProcessors.filter((item): item is string => typeof item === "string")
            : fallback.runtimeEnabledProcessors,
        runtimeProcessorViolations: Array.isArray(value.runtimeProcessorViolations)
            ? value.runtimeProcessorViolations.filter((item): item is string => typeof item === "string")
            : fallback.runtimeProcessorViolations,
    };
}

function parseProcessorList(value: string): string[] {
    return Array.from(
        new Set(
            value
                .split(",")
                .map((item) => item.trim().toLowerCase())
                .filter(Boolean),
        ),
    );
}

function formatPrivacyMissingItem(item: string): string {
    if (item.startsWith("enabledProcessor:")) {
        return `Missing runtime processor acknowledgement: ${item.replace("enabledProcessor:", "")}`;
    }

    switch (item) {
        case "controllerIdentity":
            return "Controller identity";
        case "controllerContactEmail":
            return "Controller contact email";
        case "privacyNotice":
            return "Privacy notice URL or notice text";
        case "processorRoleAcknowledged":
            return "Processor role acknowledgement";
        case "lawfulBasisDeclarations":
            return "Lawful basis declarations";
        case "enabledProcessors":
            return "Enabled subprocessors";
        case "dataResidencyMode":
            return "EEA-only residency mode";
        case "audienceAgeMode":
            return "Learning audience age mode";
        case "retentionPolicy":
            return "Retention policy";
        default:
            return item;
    }
}

export default function SettingsPage() {
    const { user, session } = useAuth();

    // True when the user is actively in a workspace context
    const isWorkspaceContext = !!session?.activeOrganizationId;
    const router = useRouter();
    const pathname = usePathname();
    const t = useTranslations("Settings");
    const tt = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback);
    const currentLocale: AppLocale =
        isAppLocale(user?.uiLocale)
            ? user.uiLocale
            : isAppLocale(user?.preferredLanguage)
                ? user.preferredLanguage
                : "en";

    const [activeTab, setActiveTab] = useState("profile");
    const [isSaving, setIsSaving] = useState(false);
    const [profileImage, setProfileImage] = useState<string | null>(null);
    const [isPrivacyActionLoading, setIsPrivacyActionLoading] = useState(false);
    const [privacyRequestNotes, setPrivacyRequestNotes] = useState("");

    // Workspace state
    const [activeWorkspace, setActiveWorkspace] = useState<ActiveWorkspaceState | null>(null);

    const isOwner = activeWorkspace?.role === "owner";
    const isEuMode = clientEnv.NEXT_PUBLIC_GDPR_EU_MODE;

    const tabs = [
        { id: "profile", name: t("Tabs.Profile"), icon: User },
        ...(isWorkspaceContext ? [{ id: "workspace", name: t("Tabs.Workspace"), icon: Key }] : []),
        ...(isWorkspaceContext && isOwner ? [{ id: "billing", name: tt("Tabs.Billing", "Billing"), icon: CreditCard }] : []),
        { id: "notifications", name: t("Tabs.Notifications"), icon: Bell },
        { id: "preferences", name: t("Tabs.Preferences"), icon: Globe },
        { id: "privacy", name: tt("Tabs.Privacy", "Privacy"), icon: AlertCircle },
        { id: "security", name: t("Tabs.Security"), icon: Shield },
    ];

    // Profile state
    const [profile, setProfile] = useState({
        name: user?.name || "",
        email: user?.email || "",
        image: user?.image || "",
    });

    const [wsName, setWsName] = useState("");
    const [wsSlug, setWsSlug] = useState("");
    const [wsLogo, setWsLogo] = useState<string | null>(null);
    const [workspaceLocalization, setWorkspaceLocalization] = useState<WorkspaceLocaleSettings>({
        defaultUiLocale: "en",
        defaultContentLocale: "en",
        emailLocale: "en",
        allowedLocales: ["en", "fr", "de", "es", "it"],
        autoTranslateGeneratedContent: true,
    });
    const [workspacePrivacy, setWorkspacePrivacy] = useState<WorkspacePrivacyState>(
        defaultWorkspacePrivacyState,
    );

    const [notifications, setNotifications] = useState<NotificationSettings>(initialNotifications);

    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });

    useEffect(() => {
        if (user) {
            setProfile({
                name: user.name || "",
                email: user.email || "",
                image: user.image || "",
            });
        }
    }, [user]);

    useEffect(() => {
        async function loadWorkspace() {
            const result = await getActiveWorkspace();
            if (result.success && result.data) {
                setActiveWorkspace(result.data);
                setWsName(result.data.name);
                setWsSlug(result.data.slug);
                setWsLogo(result.data.logo || null);
                setWorkspaceLocalization(result.data.localization);
                setWorkspacePrivacy(result.data.privacy);
            }
        }
        loadWorkspace();
    }, []);

    useRealtime({
        channels: session?.activeOrganizationId ? [`workspace:${session.activeOrganizationId}`] : [],
        onEvent: (event: RealtimeEvent) => {
            if (event.eventType !== "workspace.settings_updated" || event.workspaceId !== session?.activeOrganizationId) {
                return;
            }

            const payload = event.payload;
            if (!isRecord(payload)) return;
            
            const updates = isRecord(payload.updates) ? payload.updates : {};
            
            const name = typeof updates.name === "string" ? updates.name : undefined;
            const slug = typeof updates.slug === "string" ? updates.slug : undefined;
            const logo = (typeof updates.logo === "string" || updates.logo === null) ? updates.logo : undefined;
            const localization = payload.localization
                ? normalizeWorkspaceLocalizationInput(
                    payload.localization,
                    workspaceLocalization,
                )
                : undefined;
            const privacy = payload.privacy
                ? normalizeWorkspacePrivacyState(
                    payload.privacy,
                    workspacePrivacy,
                )
                : undefined;

            if (name) setWsName(name);
            if (slug) setWsSlug(slug);
            if (logo !== undefined) setWsLogo(logo);
            if (localization) setWorkspaceLocalization(localization);
            if (privacy) setWorkspacePrivacy(privacy);

            setActiveWorkspace(prev => prev ? {
                ...prev,
                name: name || prev.name,
                slug: slug || prev.slug,
                logo: logo !== undefined ? logo : prev.logo,
                localization: localization || prev.localization,
                privacy: privacy || prev.privacy,
            } : null);
        },
    });

    const handleProfileSave = async () => {
        setIsSaving(true);
        try {
            await authClient.updateUser({
                name: profile.name,
                image: profileImage || profile.image || undefined,
                fetchOptions: {
                    onSuccess: async () => {
                        toast.success(tt("Profile.Saved", "Settings saved successfully"));
                    },
                    onError: async (ctx) => {
                        toast.error(ctx.error.message || tt("Error", "Failed to save settings"));
                    }
                }
            });
        } catch (error) {
            console.error("[handleProfileSave] Failed:", error);
            toast.error(tt("Error", "An error occurred while saving profile"));
        } finally {
            setIsSaving(false);
        }
    };

    const handlePasswordUpdate = async () => {
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast.error(t("Security.PasswordMismatch"));
            return;
        }
        setIsSaving(true);
        try {
            await authClient.changePassword({
                newPassword: passwordData.newPassword,
                currentPassword: passwordData.currentPassword,
                fetchOptions: {
                    onSuccess: async () => {
                        toast.success(tt("Security.Success", "Password updated successfully"));
                        setPasswordData({
                            currentPassword: "",
                            newPassword: "",
                            confirmPassword: "",
                        });
                    },
                    onError: async (ctx) => {
                        toast.error(ctx.error.message || tt("Security.Error", "Failed to update password"));
                    }
                }
            });
        } catch (error) {
            console.error("[handlePasswordUpdate] Failed:", error);
            toast.error(tt("Security.Error", "An error occurred while updating password"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleWorkspaceSave = async () => {
        if (!activeWorkspace) return;
        if (!isOwner) {
            toast.error("Only the workspace owner can update workspace settings");
            return;
        }
        setIsSaving(true);
        try {
            const [workspaceResult, localizationResult, privacyResult] = await Promise.all([
                updateWorkspace({
                    organizationId: activeWorkspace.id,
                    name: wsName,
                    slug: wsSlug,
                    logo: wsLogo || undefined,
                }),
                updateWorkspaceLocalizationSettingsAction({
                    organizationId: activeWorkspace.id,
                    settings: workspaceLocalization,
                }),
                updateWorkspacePrivacyProfileAction({
                    organizationId: activeWorkspace.id,
                    settings: workspacePrivacy.settings,
                    retention: workspacePrivacy.retention,
                }),
            ]);
            if (workspaceResult.success && localizationResult.success && privacyResult.success) {
                toast.success(tt("Workspace.Updated", "Workspace updated successfully"));
                setActiveWorkspace({
                    ...activeWorkspace,
                    name: wsName,
                    slug: wsSlug,
                    logo: wsLogo,
                    localization: localizationResult.data,
                    privacy: privacyResult.data,
                });
                setWorkspacePrivacy(privacyResult.data);
            } else {
                const errorMessage = !workspaceResult.success
                    ? workspaceResult.error || "Failed to update workspace"
                    : !localizationResult.success
                        ? localizationResult.error || "Failed to update workspace language settings"
                        : !privacyResult.success
                            ? privacyResult.error || "Failed to update workspace privacy settings"
                            : "Failed to update workspace";
                toast.error(
                    errorMessage,
                );
            }
        } catch (error) {
            console.error("[handleWorkspaceSave] Failed:", error);
            toast.error(tt("Workspace.UpdateError", "An error occurred while updating workspace"));
        } finally {
            setIsSaving(false);
        }
    };

    const getNotificationStateKey = (
        type: NotificationChannel,
        key: NotificationOptionKey,
    ) => notificationStateKeyMap[type][key];

    const handleNotificationToggle = (
        type: NotificationChannel,
        key: NotificationOptionKey,
    ) => {
        const stateKey = getNotificationStateKey(type, key);
        if (!stateKey) {
            return;
        }

        setNotifications((prev) => ({
            ...prev,
            [stateKey]: !prev[stateKey],
        }));
    };

    const handlePrivacyRequest = async (
        requestType: "rectification" | "restriction" | "objection" | "delete_workspace_content",
        scope: "user" | "workspace",
    ) => {
        setIsPrivacyActionLoading(true);
        try {
            const response = await fetch("/api/privacy/request", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    requestType,
                    scope,
                    organizationId: scope === "workspace" ? activeWorkspace?.id : undefined,
                    details: privacyRequestNotes || undefined,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                toast.error(
                    typeof data.error === "string"
                        ? data.error
                        : tt("Privacy.RequestError", "Failed to create privacy request"),
                );
                return;
            }

            setPrivacyRequestNotes("");
            toast.success(tt("Privacy.RequestCreated", "Privacy request created"));
        } catch (error) {
            console.error("[handlePrivacyRequest] Failed:", error);
            toast.error(tt("Privacy.RequestError", "Failed to create privacy request"));
        } finally {
            setIsPrivacyActionLoading(false);
        }
    };

    const handlePrivacyExport = async (scope: "user" | "workspace") => {
        setIsPrivacyActionLoading(true);
        try {
            const response = await fetch("/api/privacy/export", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    scope,
                    organizationId: scope === "workspace" ? activeWorkspace?.id : undefined,
                }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                toast.error(
                    typeof data.error === "string"
                        ? data.error
                        : tt("Privacy.ExportError", "Failed to export privacy data"),
                );
                return;
            }

            if (typeof window !== "undefined") {
                const blob = new Blob([JSON.stringify(data.data ?? {}, null, 2)], {
                    type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download =
                    scope === "workspace"
                        ? `convy-workspace-privacy-export-${activeWorkspace?.slug ?? "workspace"}.json`
                        : "convy-account-privacy-export.json";
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
            }

            toast.success(tt("Privacy.ExportReady", "Privacy export downloaded"));
        } catch (error) {
            console.error("[handlePrivacyExport] Failed:", error);
            toast.error(tt("Privacy.ExportError", "Failed to export privacy data"));
        } finally {
            setIsPrivacyActionLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        const confirmed = window.confirm(
            tt("Privacy.DeleteAccountConfirm", "Delete your account and remove your personal data? This cannot be undone."),
        );
        if (!confirmed) {
            return;
        }

        setIsPrivacyActionLoading(true);
        try {
            const response = await fetch("/api/privacy/delete-account", {
                method: "POST",
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                toast.error(
                    typeof data.error === "string"
                        ? data.error
                        : tt("Privacy.DeleteAccountError", "Failed to delete account"),
                );
                return;
            }

            toast.success(tt("Privacy.DeleteAccountSuccess", "Account deletion completed"));
            window.location.href = "/";
        } catch (error) {
            console.error("[handleDeleteAccount] Failed:", error);
            toast.error(tt("Privacy.DeleteAccountError", "Failed to delete account"));
        } finally {
            setIsPrivacyActionLoading(false);
        }
    };

    const handleSave = async () => {
        if (activeTab === "profile") {
            await handleProfileSave();
        } else if (activeTab === "workspace") {
            await handleWorkspaceSave();
        } else if (activeTab === "security") {
            await handlePasswordUpdate();
        } else if (activeTab === "notifications") {
            setIsSaving(true);
            await new Promise((resolve) => setTimeout(resolve, 800));
            toast.success(t("Notifications.Saved"));
            setIsSaving(false);
        } else if (activeTab === "preferences") {
            toast.success(t("Preferences.Toast"));
        } else {
            setIsSaving(true);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            setIsSaving(false);
            toast.success(tt("Profile.Saved", "Settings saved successfully"));
        }
    };

    const handleLanguageChange = async (newLocale: AppLocale) => {
        const result = await updateUserLanguage(newLocale);
        if (result.success) {
            toast.success(t("Preferences.Toast") || "Language updated successfully");
            // Navigate to the same path but with the new locale to update the UI shell
            router.push(pathname, { locale: newLocale });
        } else {
            toast.error(tt("Error", "Failed to update language"));
        }
    };

    const notificationItems: Array<{
        title: string;
        description: string;
        key: NotificationOptionKey;
    }> = [
        {
            title: t("Notifications.Types.NewResponse"),
            description: t("Notifications.Types.NewResponseDesc"),
            key: "NewResponse",
        },
        {
            title: t("Notifications.Types.WeeklySummary"),
            description: t("Notifications.Types.WeeklySummaryDesc"),
            key: "WeeklySummary",
        },
        {
            title: tt("Notifications.Types.SurveyComplete", "Survey complete"),
            description: tt("Notifications.Types.SurveyCompleteDesc", "Receive push notifications when an important survey flow reaches completion"),
            key: "SurveyComplete",
        },
    ];
    if (isWorkspaceContext) {
        notificationItems.splice(2, 0, {
            title: t("Notifications.Types.TeamUpdates"),
            description: t("Notifications.Types.TeamUpdatesDesc"),
            key: "TeamUpdates",
        });
    }

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t("Header.Title")}</h1>
                <p className="text-gray-500 mt-1">
                    {t("Header.Description")}
                </p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Tabs Sidebar */}
                <div className="lg:w-56 flex-shrink-0">
                    <nav className="space-y-1">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                                    activeTab === tab.id
                                        ? "bg-gray-900 text-white"
                                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                                )}
                            >
                                <tab.icon className="w-5 h-5" />
                                {tab.name}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Content */}
                <div className="flex-1">
                    {/* Profile Tab */}
                    {activeTab === "profile" && (
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h2 className="text-lg font-semibold text-gray-900">{t("Profile.Title")}</h2>
                                <p className="text-sm text-gray-500">{t("Profile.Description")}</p>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Avatar */}
                                <div className="flex items-center gap-5">
                                    <div className="relative">
                                        {profileImage || profile.image ? (
                                            <Image
                                                src={profileImage || profile.image}
                                                alt="Profile"
                                                width={80}
                                                height={80}
                                                unoptimized
                                                className="w-20 h-20 rounded-2xl object-cover"
                                            />
                                        ) : (
                                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-800 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                                                {profile.name.charAt(0)}
                                            </div>
                                        )}
                                        <label className="absolute -bottom-1 -right-1 w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white hover:bg-gray-800 transition-colors cursor-pointer">
                                            <Camera className="w-4 h-4" />
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        const reader = new FileReader();
                                                        reader.onload = (event) => {
                                                            if (typeof event.target?.result === "string") {
                                                                setProfileImage(event.target.result);
                                                            }
                                                        };
                                                        reader.readAsDataURL(file);
                                                    }
                                                }}
                                            />
                                        </label>
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">{profile.name}</p>
                                        <p className="text-sm text-gray-500">{profile.email}</p>
                                        <button
                                            onClick={() => setProfileImage(null)}
                                            className="text-xs text-red-500 hover:text-red-600 mt-1"
                                            style={{ display: profileImage ? 'block' : 'none' }}
                                        >
                                            {t("Profile.RemovePhoto")}
                                        </button>
                                    </div>
                                </div>

                                {/* Form Fields */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            {t("Profile.FullName")}
                                        </label>
                                        <input
                                            type="text"
                                            value={profile.name}
                                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            {t("Profile.Email")}
                                        </label>
                                        <input
                                            type="email"
                                            value={profile.email}
                                            disabled
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed outline-none transition-all"
                                        />
                                        <p className="mt-1 text-xs text-gray-400 font-normal italic">{t("Profile.EmailHint")}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {t("Profile.Saving")}
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            {t("Profile.Save")}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Workspace Tab */}
                    {activeTab === "workspace" && (
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h2 className="text-lg font-semibold text-gray-900">{t("Workspace.Title")}</h2>
                                <p className="text-sm text-gray-500">{t("Workspace.Description")}</p>
                            </div>

                            <div className="p-6 space-y-6">
                                {!activeWorkspace ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {!isOwner && (
                                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                                {tt("Workspace.MemberNotice", "Workspace settings are visible to members, but only the workspace owner can change them.")}
                                            </div>
                                        )}
                                        {/* Workspace Logo */}
                                        <div className="flex items-center gap-5">
                                            <div className="relative">
                                                {wsLogo ? (
                                                    <Image
                                                        src={wsLogo}
                                                        alt="Workspace Logo"
                                                        width={64}
                                                        height={64}
                                                        unoptimized
                                                        className="w-16 h-16 rounded-xl object-cover border border-gray-100"
                                                    />
                                                ) : (
                                                    <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400">
                                                        <Camera className="w-6 h-6" />
                                                    </div>
                                                )}
                                                <label className="absolute -bottom-1 -right-1 w-6 h-6 bg-gray-900 rounded-lg flex items-center justify-center text-white hover:bg-gray-800 transition-colors cursor-pointer shadow-sm">
                                                    <Camera className="w-3 h-3" />
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        disabled={!isOwner}
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                const reader = new FileReader();
                                                                reader.onload = (event) => {
                                                                    if (typeof event.target?.result === "string") {
                                                                        setWsLogo(event.target.result);
                                                                    }
                                                                };
                                                                reader.readAsDataURL(file);
                                                            }
                                                        }}
                                                    />
                                                </label>
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900">{t("Workspace.Logo")}</p>
                                                <p className="text-xs text-gray-500">{tt("Workspace.LogoUploadHint", "Upload a square image for your workspace.")}</p>
                                                {wsLogo && (
                                                    <button
                                                        onClick={() => setWsLogo(null)}
                                                        disabled={!isOwner}
                                                        className="text-xs text-red-500 hover:text-red-600 mt-1"
                                                    >
                                                        {t("Workspace.Remove")}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-5">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    {t("Workspace.Name")}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={wsName}
                                                    onChange={(e) => setWsName(e.target.value)}
                                                    disabled={!isOwner}
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    {t("Workspace.Slug")}
                                                </label>
                                                <div className="flex gap-2">
                                                    <span className="flex items-center px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 text-sm">
                                                        convy.app/
                                                    </span>
                                                    <input
                                                        type="text"
                                                        value={wsSlug}
                                                        onChange={(e) => setWsSlug(e.target.value)}
                                                        disabled={!isOwner}
                                                        className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-5 space-y-5">
                                            <div>
                                                <h3 className="text-sm font-semibold text-gray-900">{tt("Workspace.Language.Title", "Workspace Languages")}</h3>
                                                <p className="mt-1 text-sm text-gray-500">
                                                    {tt("Workspace.Language.Description", "Choose workspace defaults for app UI, content creation, and outgoing emails. Each member still chooses their own interface language.")}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        {tt("Workspace.Language.DefaultUi", "Default interface language")}
                                                    </label>
                                                    <select
                                                        value={workspaceLocalization.defaultUiLocale}
                                                        onChange={(e) => {
                                                            const nextLocale = e.target.value;
                                                            if (!isAppLocale(nextLocale)) return;
                                                            setWorkspaceLocalization((prev) => ({
                                                                ...prev,
                                                                defaultUiLocale: nextLocale,
                                                            }));
                                                        }}
                                                        disabled={!isOwner}
                                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                    >
                                                        {localeOptions.map((locale) => (
                                                            <option key={`workspace-ui-${locale.code}`} value={locale.code}>
                                                                {locale.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        {tt("Workspace.Language.DefaultContent", "Default content language")}
                                                    </label>
                                                    <select
                                                        value={workspaceLocalization.defaultContentLocale}
                                                        onChange={(e) => {
                                                            const nextLocale = e.target.value;
                                                            if (!isAppLocale(nextLocale)) return;
                                                            setWorkspaceLocalization((prev) => ({
                                                                ...prev,
                                                                defaultContentLocale: nextLocale,
                                                                allowedLocales: prev.allowedLocales.includes(nextLocale)
                                                                    ? prev.allowedLocales
                                                                    : [...prev.allowedLocales, nextLocale],
                                                            }));
                                                        }}
                                                        disabled={!isOwner}
                                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                    >
                                                        {localeOptions.map((locale) => (
                                                            <option key={`workspace-content-${locale.code}`} value={locale.code}>
                                                                {locale.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        {tt("Workspace.Language.Email", "Email language")}
                                                    </label>
                                                    <select
                                                        value={workspaceLocalization.emailLocale}
                                                        onChange={(e) => {
                                                            const nextLocale = e.target.value;
                                                            if (!isAppLocale(nextLocale)) return;
                                                            setWorkspaceLocalization((prev) => ({
                                                                ...prev,
                                                                emailLocale: nextLocale,
                                                                allowedLocales: prev.allowedLocales.includes(nextLocale)
                                                                    ? prev.allowedLocales
                                                                    : [...prev.allowedLocales, nextLocale],
                                                            }));
                                                        }}
                                                        disabled={!isOwner}
                                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                    >
                                                        {localeOptions.map((locale) => (
                                                            <option key={`workspace-email-${locale.code}`} value={locale.code}>
                                                                {locale.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-3">
                                                    {tt("Workspace.Language.Allowed", "Allowed content languages")}
                                                </label>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {localeOptions.map((locale) => {
                                                        const enabled = workspaceLocalization.allowedLocales.includes(locale.code);
                                                        const isRequired =
                                                            locale.code === workspaceLocalization.defaultContentLocale ||
                                                            locale.code === workspaceLocalization.emailLocale;

                                                        return (
                                                            <label
                                                                key={`workspace-allowed-${locale.code}`}
                                                                className={cn(
                                                                    "flex items-center gap-3 rounded-xl border px-4 py-3 bg-white text-sm transition-colors",
                                                                    enabled ? "border-gray-900" : "border-gray-200",
                                                                )}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={enabled}
                                                                    disabled={!isOwner || isRequired}
                                                                    onChange={() =>
                                                                        setWorkspaceLocalization((prev) => {
                                                                            const nextAllowed = enabled
                                                                                ? prev.allowedLocales.filter((item) => item !== locale.code)
                                                                                : [...prev.allowedLocales, locale.code];

                                                                            return {
                                                                                ...prev,
                                                                                allowedLocales: nextAllowed.length > 0 ? nextAllowed : prev.allowedLocales,
                                                                            };
                                                                        })
                                                                    }
                                                                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                                                />
                                                                <span className="font-medium text-gray-800">
                                                                    {locale.flag} {locale.name}
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                                                <input
                                                    type="checkbox"
                                                    checked={workspaceLocalization.autoTranslateGeneratedContent}
                                                    onChange={(e) =>
                                                        setWorkspaceLocalization((prev) => ({
                                                            ...prev,
                                                            autoTranslateGeneratedContent: e.target.checked,
                                                        }))
                                                    }
                                                    disabled={!isOwner}
                                                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                                />
                                                <span>{tt("Workspace.Language.AutoTranslateDescription", "Automatically translate generated summaries when a translated version is requested and missing.")}</span>
                                            </label>
                                        </div>

                                        <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-5 space-y-5">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-sm font-semibold text-gray-900">{tt("Workspace.Privacy.Title", "Workspace Privacy Profile")}</h3>
                                                    {isEuMode ? (
                                                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                                            EU mode
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <p className="text-sm text-gray-500">
                                                    {tt("Workspace.Privacy.Description", "This profile blocks survey publishing and classroom activation in EU mode until controller details, lawful basis, retention, age mode, and processor acknowledgements are complete.")}
                                                </p>
                                            </div>

                                            {workspacePrivacy.missingItems.length > 0 ? (
                                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                                    <p className="font-medium">{tt("Workspace.Privacy.MissingTitle", "Still required before GDPR readiness")}</p>
                                                    <p className="mt-2">
                                                        {workspacePrivacy.missingItems.map(formatPrivacyMissingItem).join(", ")}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                                    {tt("Workspace.Privacy.Ready", "This workspace privacy profile is currently complete for the configured EU rules.")}
                                                </div>
                                            )}

                                            {workspacePrivacy.runtimeProcessorViolations.length > 0 ? (
                                                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                                    {tt("Workspace.Privacy.ProcessorWarning", "Some enabled processors are not approved for EU mode")}: {workspacePrivacy.runtimeProcessorViolations.join(", ")}
                                                </div>
                                            ) : null}

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        {tt("Workspace.Privacy.ControllerIdentity", "Controller legal name")}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={workspacePrivacy.settings.controllerIdentity ?? ""}
                                                        onChange={(e) =>
                                                            setWorkspacePrivacy((prev) => ({
                                                                ...prev,
                                                                settings: {
                                                                    ...prev.settings,
                                                                    controllerIdentity: e.target.value || null,
                                                                },
                                                            }))
                                                        }
                                                        disabled={!isOwner}
                                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        {tt("Workspace.Privacy.ControllerContactName", "Controller contact name")}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={workspacePrivacy.settings.controllerContactName ?? ""}
                                                        onChange={(e) =>
                                                            setWorkspacePrivacy((prev) => ({
                                                                ...prev,
                                                                settings: {
                                                                    ...prev.settings,
                                                                    controllerContactName: e.target.value || null,
                                                                },
                                                            }))
                                                        }
                                                        disabled={!isOwner}
                                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        {tt("Workspace.Privacy.ControllerContactEmail", "Controller contact email")}
                                                    </label>
                                                    <input
                                                        type="email"
                                                        value={workspacePrivacy.settings.controllerContactEmail ?? ""}
                                                        onChange={(e) =>
                                                            setWorkspacePrivacy((prev) => ({
                                                                ...prev,
                                                                settings: {
                                                                    ...prev.settings,
                                                                    controllerContactEmail: e.target.value || null,
                                                                },
                                                            }))
                                                        }
                                                        disabled={!isOwner}
                                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        {tt("Workspace.Privacy.DpoContactEmail", "DPO contact email")}
                                                    </label>
                                                    <input
                                                        type="email"
                                                        value={workspacePrivacy.settings.dpoContactEmail ?? ""}
                                                        onChange={(e) =>
                                                            setWorkspacePrivacy((prev) => ({
                                                                ...prev,
                                                                settings: {
                                                                    ...prev.settings,
                                                                    dpoContactEmail: e.target.value || null,
                                                                },
                                                            }))
                                                        }
                                                        disabled={!isOwner}
                                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        {tt("Workspace.Privacy.NoticeUrl", "Privacy notice URL")}
                                                    </label>
                                                    <input
                                                        type="url"
                                                        value={workspacePrivacy.settings.privacyNoticeUrl ?? ""}
                                                        onChange={(e) =>
                                                            setWorkspacePrivacy((prev) => ({
                                                                ...prev,
                                                                settings: {
                                                                    ...prev.settings,
                                                                    privacyNoticeUrl: e.target.value || null,
                                                                },
                                                            }))
                                                        }
                                                        disabled={!isOwner}
                                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        {tt("Workspace.Privacy.EnabledProcessors", "Enabled processor IDs")}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={workspacePrivacy.settings.enabledProcessors.join(", ")}
                                                        onChange={(e) =>
                                                            setWorkspacePrivacy((prev) => ({
                                                                ...prev,
                                                                settings: {
                                                                    ...prev.settings,
                                                                    enabledProcessors: parseProcessorList(e.target.value),
                                                                },
                                                            }))
                                                        }
                                                        disabled={!isOwner}
                                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                    />
                                                    <p className="mt-2 text-xs text-gray-500">
                                                        {tt("Workspace.Privacy.EnabledProcessorsHint", "Runtime processors detected")}: {workspacePrivacy.runtimeEnabledProcessors.join(", ") || tt("Workspace.Privacy.None", "none")}
                                                    </p>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    {tt("Workspace.Privacy.NoticeText", "Embedded privacy notice text")}
                                                </label>
                                                <textarea
                                                    value={workspacePrivacy.settings.privacyNoticeText ?? ""}
                                                    onChange={(e) =>
                                                        setWorkspacePrivacy((prev) => ({
                                                            ...prev,
                                                            settings: {
                                                                ...prev.settings,
                                                                privacyNoticeText: e.target.value || null,
                                                            },
                                                        }))
                                                    }
                                                    disabled={!isOwner}
                                                    rows={4}
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    {tt("Workspace.Privacy.LawfulBasis", "Lawful basis declarations")}
                                                </label>
                                                <textarea
                                                    value={workspacePrivacy.settings.lawfulBasisDeclarations
                                                        .map((entry) => `${entry.purpose}: ${entry.lawfulBasis}${entry.notes ? ` (${entry.notes})` : ""}`)
                                                        .join("\n")}
                                                    onChange={(e) =>
                                                        setWorkspacePrivacy((prev) => ({
                                                            ...prev,
                                                            settings: {
                                                                ...prev.settings,
                                                                lawfulBasisDeclarations: e.target.value
                                                                    .split("\n")
                                                                    .map((line) => line.trim())
                                                                    .filter(Boolean)
                                                                    .map((line) => {
                                                                        const [purposePart, ...rest] = line.split(":");
                                                                        const purpose = purposePart?.trim() || line;
                                                                        const lawfulBasis = rest.join(":").trim() || "contract";
                                                                        return {
                                                                            purpose,
                                                                            lawfulBasis,
                                                                            notes: null,
                                                                        };
                                                                    }),
                                                            },
                                                        }))
                                                    }
                                                    disabled={!isOwner}
                                                    rows={4}
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                />
                                                <p className="mt-2 text-xs text-gray-500">
                                                    {tt("Workspace.Privacy.LawfulBasisHint", "One line per purpose, formatted as `purpose: lawful basis`.")}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        {tt("Workspace.Privacy.ResidencyMode", "Data residency mode")}
                                                    </label>
                                                    <select
                                                        value={workspacePrivacy.settings.dataResidencyMode}
                                                        onChange={(e) =>
                                                            setWorkspacePrivacy((prev) => ({
                                                                ...prev,
                                                                settings: {
                                                                    ...prev.settings,
                                                                    dataResidencyMode:
                                                                        e.target.value === "approved_transfers"
                                                                            ? "approved_transfers"
                                                                            : "eea_only",
                                                                },
                                                            }))
                                                        }
                                                        disabled={!isOwner}
                                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                    >
                                                        <option value="eea_only">{tt("Workspace.Privacy.ResidencyEeaOnly", "EEA only")}</option>
                                                        <option value="approved_transfers">{tt("Workspace.Privacy.ResidencyApprovedTransfers", "Approved transfers")}</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        {tt("Workspace.Privacy.AudienceAgeMode", "Learning audience age mode")}
                                                    </label>
                                                    <select
                                                        value={workspacePrivacy.settings.audienceAgeMode}
                                                        onChange={(e) =>
                                                            setWorkspacePrivacy((prev) => ({
                                                                ...prev,
                                                                settings: {
                                                                    ...prev.settings,
                                                                    audienceAgeMode:
                                                                        e.target.value === "adult_only" ||
                                                                            e.target.value === "includes_minors" ||
                                                                            e.target.value === "unset"
                                                                            ? e.target.value
                                                                            : "unset",
                                                                },
                                                            }))
                                                        }
                                                        disabled={!isOwner}
                                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                    >
                                                        <option value="unset">{tt("Workspace.Privacy.AudienceUnset", "Unset")}</option>
                                                        <option value="adult_only">{tt("Workspace.Privacy.AudienceAdultOnly", "Adult only")}</option>
                                                        <option value="includes_minors">{tt("Workspace.Privacy.AudienceIncludesMinors", "Includes minors")}</option>
                                                    </select>
                                                </div>
                                                <div className="flex items-end">
                                                    <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 w-full">
                                                        <input
                                                            type="checkbox"
                                                            checked={workspacePrivacy.settings.processorRoleAcknowledged}
                                                            onChange={(e) =>
                                                                setWorkspacePrivacy((prev) => ({
                                                                    ...prev,
                                                                    settings: {
                                                                        ...prev.settings,
                                                                        processorRoleAcknowledged: e.target.checked,
                                                                    },
                                                                }))
                                                            }
                                                            disabled={!isOwner}
                                                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                                        />
                                                        <span>{tt("Workspace.Privacy.ProcessorAcknowledgement", "We act as processor for customer content and controller only for service account, security, billing, and operations data.")}</span>
                                                    </label>
                                                </div>
                                            </div>

                                            <div className="rounded-xl border border-gray-200 bg-white p-4">
                                                <h4 className="text-sm font-semibold text-gray-900">{tt("Workspace.Privacy.RetentionTitle", "Retention windows (days)")}</h4>
                                                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                                                    {([
                                                        ["rawTranscriptDays", tt("Workspace.Privacy.RawTranscriptDays", "Raw transcripts")],
                                                        ["voiceTelemetryDays", tt("Workspace.Privacy.VoiceTelemetryDays", "Voice telemetry")],
                                                        ["derivedAnalyticsDays", tt("Workspace.Privacy.DerivedAnalyticsDays", "Derived analytics")],
                                                        ["studentInteractionDays", tt("Workspace.Privacy.StudentInteractionDays", "Student interactions")],
                                                        ["privacyRequestDays", tt("Workspace.Privacy.PrivacyRequestDays", "Privacy request logs")],
                                                    ] as const).map(([key, label]) => (
                                                        <label key={key} className="block">
                                                            <span className="block text-sm font-medium text-gray-700 mb-2">{label}</span>
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                value={workspacePrivacy.retention[key]}
                                                                onChange={(e) =>
                                                                    setWorkspacePrivacy((prev) => ({
                                                                        ...prev,
                                                                        retention: {
                                                                            ...prev.retention,
                                                                            [key]: Math.max(1, Number(e.target.value) || 1),
                                                                        },
                                                                    }))
                                                                }
                                                                disabled={!isOwner}
                                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                            />
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {activeWorkspace && (
                                <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving || !isOwner}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 shadow-sm"
                                    >
                                        {isSaving ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                {t("Workspace.Updating")}
                                            </>
                                        ) : (
                                            <>
                                                <Check className="w-4 h-4" />
                                                {t("Workspace.Update")}
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Notifications Tab */}
                    {activeTab === "notifications" && (
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h2 className="text-lg font-semibold text-gray-900">{t("Notifications.Title")}</h2>
                                <p className="text-sm text-gray-500">{t("Notifications.Description")}</p>
                            </div>
                            <div className="p-6">
                                <div className="space-y-6">
                                    {notificationItems.map((item, index) => {
                                        const emailStateKey = getNotificationStateKey("email", item.key);
                                        const pushStateKey = getNotificationStateKey("push", item.key);

                                        return (
                                            <div key={index} className="flex items-start justify-between pb-6 border-b border-gray-100 last:border-0 last:pb-0">
                                                <div>
                                                    <h3 className="font-medium text-gray-900">{item.title}</h3>
                                                    <p className="text-sm text-gray-500 mt-1">{item.description}</p>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    {emailStateKey ? (
                                                        <label className="flex items-center gap-2 cursor-pointer group">
                                                            <input
                                                                type="checkbox"
                                                                className="hidden"
                                                                checked={notifications[emailStateKey]}
                                                                onChange={() => handleNotificationToggle("email", item.key)}
                                                            />
                                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${notifications[emailStateKey] ? "bg-gray-900 border-gray-900" : "border-gray-300 bg-white"}`}>
                                                                {notifications[emailStateKey] ? <Check className="w-3.5 h-3.5 text-white" /> : null}
                                                            </div>
                                                            <span className="text-sm text-gray-600 group-hover:text-gray-900">{tt("Notifications.ChannelEmail", "Email")}</span>
                                                        </label>
                                                    ) : null}
                                                    {pushStateKey ? (
                                                        <label className="flex items-center gap-2 cursor-pointer group">
                                                            <input
                                                                type="checkbox"
                                                                className="hidden"
                                                                checked={notifications[pushStateKey]}
                                                                onChange={() => handleNotificationToggle("push", item.key)}
                                                            />
                                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${notifications[pushStateKey] ? "bg-gray-900 border-gray-900" : "border-gray-300 bg-white"}`}>
                                                                {notifications[pushStateKey] ? <Check className="w-3.5 h-3.5 text-white" /> : null}
                                                            </div>
                                                            <span className="text-sm text-gray-600 group-hover:text-gray-900">{tt("Notifications.ChannelPush", "Push")}</span>
                                                        </label>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {t("Notifications.Saving")}
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            {t("Notifications.Save")}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Preferences Tab */}
                    {activeTab === "preferences" && (
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h2 className="text-lg font-semibold text-gray-900">{t("Preferences.Title")}</h2>
                                <p className="text-sm text-gray-500">{t("Preferences.Description")}</p>
                            </div>

                            <div className="p-6 space-y-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Globe className="w-5 h-5 text-gray-500" />
                                        <h3 className="font-medium text-gray-900">{t("Preferences.Language")}</h3>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {localeOptions.map((lang) => (
                                            <button
                                                key={lang.code}
                                                onClick={() => handleLanguageChange(lang.code)}
                                                className={cn(
                                                    "flex items-center gap-3 p-4 rounded-xl border transition-all text-left",
                                                    currentLocale === lang.code
                                                        ? "border-gray-900 bg-gray-50 ring-1 ring-gray-900"
                                                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                                                )}
                                            >
                                                <span className="text-2xl">{lang.flag}</span>
                                                <span className={cn(
                                                    "font-medium",
                                                    currentLocale === lang.code ? "text-gray-900" : "text-gray-600"
                                                )}>
                                                    {lang.name}
                                                </span>
                                                {currentLocale === lang.code && (
                                                    <div className="ml-auto">
                                                        <Check className="w-4 h-4 text-gray-900" />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "privacy" && (
                        <div className="space-y-6">
                            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100">
                                    <h2 className="text-lg font-semibold text-gray-900">{tt("Privacy.Title", "Privacy Center")}</h2>
                                    <p className="text-sm text-gray-500">
                                        {tt("Privacy.Description", "Export your data, submit GDPR rights requests, and manage workspace privacy operations.")}
                                    </p>
                                </div>

                                <div className="p-6 space-y-6">
                                    <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-5 space-y-4">
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-900">{tt("Privacy.AccountTitle", "Your account data")}</h3>
                                            <p className="mt-1 text-sm text-gray-500">
                                                {tt("Privacy.AccountDescription", "Download your account data, request rectification or restriction, object to processing, or delete your account.")}
                                            </p>
                                        </div>

                                        <div className="flex flex-col sm:flex-row gap-3">
                                            <button
                                                onClick={() => handlePrivacyExport("user")}
                                                disabled={isPrivacyActionLoading}
                                                className="px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
                                            >
                                                {tt("Privacy.ExportAccount", "Export my data")}
                                            </button>
                                            <button
                                                onClick={() => handlePrivacyRequest("rectification", "user")}
                                                disabled={isPrivacyActionLoading}
                                                className="px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-50"
                                            >
                                                {tt("Privacy.Rectification", "Request rectification")}
                                            </button>
                                            <button
                                                onClick={() => handlePrivacyRequest("restriction", "user")}
                                                disabled={isPrivacyActionLoading}
                                                className="px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-50"
                                            >
                                                {tt("Privacy.Restriction", "Request restriction")}
                                            </button>
                                            <button
                                                onClick={() => handlePrivacyRequest("objection", "user")}
                                                disabled={isPrivacyActionLoading}
                                                className="px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-50"
                                            >
                                                {tt("Privacy.Objection", "Object to processing")}
                                            </button>
                                        </div>

                                        <button
                                            onClick={handleDeleteAccount}
                                            disabled={isPrivacyActionLoading}
                                            className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                                        >
                                            {tt("Privacy.DeleteAccount", "Delete my account")}
                                        </button>
                                    </div>

                                    {activeWorkspace && isOwner ? (
                                        <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-5 space-y-4">
                                            <div>
                                                <h3 className="text-sm font-semibold text-gray-900">{tt("Privacy.WorkspaceTitle", "Workspace controller operations")}</h3>
                                                <p className="mt-1 text-sm text-gray-500">
                                                    {tt("Privacy.WorkspaceDescription", "Export workspace data or create a tracked request to delete workspace-controlled content.")}
                                                </p>
                                            </div>

                                            <div className="flex flex-col sm:flex-row gap-3">
                                                <button
                                                    onClick={() => handlePrivacyExport("workspace")}
                                                    disabled={isPrivacyActionLoading}
                                                    className="px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
                                                >
                                                    {tt("Privacy.ExportWorkspace", "Export workspace data")}
                                                </button>
                                                <button
                                                    onClick={() => handlePrivacyRequest("delete_workspace_content", "workspace")}
                                                    disabled={isPrivacyActionLoading}
                                                    className="px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-50"
                                                >
                                                    {tt("Privacy.DeleteWorkspaceContent", "Request workspace content deletion")}
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            {tt("Privacy.Notes", "Request notes")}
                                        </label>
                                        <textarea
                                            value={privacyRequestNotes}
                                            onChange={(e) => setPrivacyRequestNotes(e.target.value)}
                                            rows={4}
                                            placeholder={tt("Privacy.NotesPlaceholder", "Add context for your request, such as which fields need correction or which processing you object to.")}
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "billing" && (
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h2 className="text-lg font-semibold text-gray-900">{tt("Billing.Title", "Billing & Subscription")}</h2>
                                <p className="text-sm text-gray-500">{tt("Billing.Description", "Manage your workspace plan and payment methods.")}</p>
                            </div>
                            <div className="p-12 flex flex-col items-center justify-center text-center">
                                <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
                                    <CreditCard className="w-8 h-8 text-gray-400" />
                                </div>
                                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                    {tt("Billing.CurrentPlan", "Current Plan:")} {activeWorkspace?.plan || tt("Billing.FreePlan", "Free")}
                                </h3>
                                <p className="text-gray-500 max-w-sm mb-8">
                                    {tt("Billing.ComingSoon", "Billing management is coming soon. You are currently on the Free plan which includes up to 50 participants per survey.")}
                                </p>
                                <button
                                    disabled
                                    className="px-6 py-3 bg-gray-100 text-gray-400 rounded-xl font-medium cursor-not-allowed"
                                >
                                    {tt("Billing.Upgrade", "Upgrade Plan")}
                                </button>
                            </div>
                        </div>
                    )}
                    {/* Security Tab */}
                    {activeTab === "security" && (
                        <div className="space-y-6">
                            {/* Password */}
                            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-100">
                                    <h2 className="text-lg font-semibold text-gray-900">{tt("Security.PanelTitle", "Security Settings")}</h2>
                                    <p className="text-sm text-gray-500">{tt("Security.PanelDescription", "Manage your password and account security options.")}</p>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            {t("Security.Current")}
                                        </label>
                                        <div className="relative">
                                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                type="password"
                                                value={passwordData.currentPassword}
                                                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                                                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            {t("Security.New")}
                                        </label>
                                        <div className="relative">
                                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                type="password"
                                                value={passwordData.newPassword}
                                                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            {t("Security.Confirm")}
                                        </label>
                                        <div className="relative">
                                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                type="password"
                                                value={passwordData.confirmPassword}
                                                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
                                    <button
                                        onClick={handlePasswordUpdate}
                                        disabled={isSaving}
                                        className="px-5 py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {isSaving ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                {t("Security.Updating")}
                                            </>
                                        ) : (
                                            <>
                                                <Check className="w-4 h-4" />
                                                {t("Security.Update")}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Two Factor */}
                            <div className="bg-white rounded-2xl border border-gray-100 p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                                            <Key className="w-5 h-5 text-orange-600" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-gray-900">{t("Security.TwoFactor.Title")}</h3>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {t("Security.TwoFactor.Description")}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        disabled
                                        className="cursor-not-allowed px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-400 bg-gray-50"
                                    >
                                        {t("Security.TwoFactor.Enable")} (Coming soon)
                                    </button>
                                </div>
                            </div>

                            {/* Danger Zone */}
                            <div className="bg-red-50 rounded-2xl border border-red-200 p-6">
                                <div className="flex items-start gap-4">
                                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                                    <div>
                                        <h3 className="font-semibold text-red-900">{t("Security.Delete.Title")}</h3>
                                        <p className="text-sm text-red-700 mt-1 mb-4">
                                            {tt("Security.Delete.FullDescription", "Permanently delete your account and all associated data. This action cannot be undone.")}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={handleDeleteAccount}
                                            disabled={isPrivacyActionLoading}
                                            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                                        >
                                            {t("Security.Delete.Button")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
