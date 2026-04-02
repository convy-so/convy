"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
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

    // Workspace state
    const [activeWorkspace, setActiveWorkspace] = useState<{
        id: string;
        name: string;
        slug: string;
        role: string;
        logo?: string | null;
        plan?: string | null;
        localization: WorkspaceLocaleSettings;
    } | null>(null);

    const isOwner = activeWorkspace?.role === "owner";

    const tabs = [
        { id: "profile", name: t("Tabs.Profile"), icon: User },
        ...(isWorkspaceContext ? [{ id: "workspace", name: t("Tabs.Workspace"), icon: Key }] : []),
        ...(isWorkspaceContext && isOwner ? [{ id: "billing", name: tt("Tabs.Billing", "Billing"), icon: CreditCard }] : []),
        { id: "notifications", name: t("Tabs.Notifications"), icon: Bell },
        { id: "preferences", name: t("Tabs.Preferences"), icon: Globe },
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

            if (name) setWsName(name);
            if (slug) setWsSlug(slug);
            if (logo !== undefined) setWsLogo(logo);
            if (localization) setWorkspaceLocalization(localization);

            setActiveWorkspace(prev => prev ? {
                ...prev,
                name: name || prev.name,
                slug: slug || prev.slug,
                logo: logo !== undefined ? logo : prev.logo,
                localization: localization || prev.localization,
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
        } catch {
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
        } catch {
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
            const [workspaceResult, localizationResult] = await Promise.all([
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
            ]);
            if (workspaceResult.success && localizationResult.success) {
                toast.success(tt("Workspace.Updated", "Workspace updated successfully"));
                setActiveWorkspace({
                    ...activeWorkspace,
                    name: wsName,
                    slug: wsSlug,
                    logo: wsLogo,
                    localization: localizationResult.data,
                });
            } else {
                const errorMessage = !workspaceResult.success
                    ? workspaceResult.error || "Failed to update workspace"
                    : !localizationResult.success
                        ? localizationResult.error || "Failed to update workspace language settings"
                        : "Failed to update workspace";
                toast.error(
                    errorMessage,
                );
            }
        } catch {
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
                                        {localeOptions.map((lang) => (<>
                                            {/*
                                            { code: "en", name: "English", flag: "🇺🇸" },
                                            { code: "fr", name: "Français", flag: "🇫🇷" },
                                            { code: "de", name: "Deutsch", flag: "🇩🇪" },
                                            { code: "es", name: "Español", flag: "🇪🇸" },
                                            { code: "it", name: "Italiano", flag: "🇮🇹" },
                                            */}
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
                                            </button></>
                                        ))}
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
                                    <button className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                                        {t("Security.TwoFactor.Enable")}
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
                                        <button className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
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
