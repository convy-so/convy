"use client";

import { useState, useEffect } from "react";
import {
    User,
    Bell,
    Shield,

    Key,
    Mail,
    Smartphone,
    Check,
    Loader2,
    Camera,
    AlertCircle,
    Globe,
    LogOut,
    CreditCard
} from "lucide-react";
import { usePathname, useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { authClient } from "@/lib/auth-client";
import { getActiveWorkspace, updateWorkspace } from "@/app/actions/workspace";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { getClientTranslation, updateUserLanguage } from "@/app/actions/translate";
import { SupportedLanguage } from "@/lib/i18n/ai-translator";
import { ClientT } from "@/components/i18n/client-t";

export default function SettingsPage() {
    const { user, session } = useAuth();

    // True when the user is actively in a workspace context
    const isWorkspaceContext = !!session?.activeOrganizationId;
    const router = useRouter();
    const pathname = usePathname();
    const t = useTranslations("Settings");
    const currentLocale = (user as { preferredLanguage?: SupportedLanguage })?.preferredLanguage || "en";

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
    } | null>(null);

    const isOwner = activeWorkspace?.role === "owner";

    const tabs = [
        { id: "profile", name: t("Tabs.Profile"), icon: User },
        // Workspace and Billing tabs only shown to owners in workspace context
        ...(isWorkspaceContext && isOwner ? [
            { id: "workspace", name: t("Tabs.Workspace"), icon: Key },
            { id: "billing", name: t("Tabs.Billing") || "Billing", icon: CreditCard }
        ] : []),
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

    const [notifications, setNotifications] = useState({
        emailNewResponse: true,
        emailWeeklySummary: true,
        emailTeamUpdates: false,
        pushNewResponse: true,
        pushSurveyComplete: true,
    });

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
            }
        }
        loadWorkspace();
    }, []);

    // Listen for real-time workspace updates
    useEffect(() => {
        if (!session?.activeOrganizationId) return;

        const handleWorkspaceUpdate = (event: any) => {
            const data = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
            
            if (data.type === "WORKSPACE_UPDATED" && data.workspaceId === session.activeOrganizationId) {
                if (data.data.name) setWsName(data.data.name);
                if (data.data.slug) setWsSlug(data.data.slug);
                if (data.data.logo !== undefined) setWsLogo(data.data.logo);
                
                setActiveWorkspace(prev => prev ? {
                    ...prev,
                    name: data.data.name || prev.name,
                    slug: data.data.slug || prev.slug,
                    logo: data.data.logo !== undefined ? data.data.logo : prev.logo
                } : null);
            }
        };

        window.addEventListener('convy-workspace-event', handleWorkspaceUpdate);
        return () => window.removeEventListener('convy-workspace-event', handleWorkspaceUpdate);
    }, [session?.activeOrganizationId]);

    const handleProfileSave = async () => {
        setIsSaving(true);
        try {
            await authClient.updateUser({
                name: profile.name,
                image: profileImage || profile.image || undefined,
                fetchOptions: {
                    onSuccess: async () => {
                        toast.success(t("Profile.Saved") || "Settings saved successfully");
                    },
                    onError: async (ctx) => {
                        toast.error(await getClientTranslation(ctx.error.message || "Failed to save settings"));
                    }
                }
            });
        } catch (error) {
            toast.error(await getClientTranslation("An error occurred while saving profile"));
        } finally {
            setIsSaving(false);
        }
    };

    const handlePasswordUpdate = async () => {
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast.error(await getClientTranslation("Passwords do not match"));
            return;
        }
        setIsSaving(true);
        try {
            await authClient.changePassword({
                newPassword: passwordData.newPassword,
                currentPassword: passwordData.currentPassword,
                fetchOptions: {
                    onSuccess: async () => {
                        toast.success(await getClientTranslation("Password updated successfully"));
                        setPasswordData({
                            currentPassword: "",
                            newPassword: "",
                            confirmPassword: "",
                        });
                    },
                    onError: async (ctx) => {
                        toast.error(await getClientTranslation(ctx.error.message || "Failed to update password"));
                    }
                }
            });
        } catch (error) {
            toast.error(await getClientTranslation("An error occurred while updating password"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleWorkspaceSave = async () => {
        if (!activeWorkspace) return;
        setIsSaving(true);
        try {
            const result = await updateWorkspace({
                organizationId: activeWorkspace.id,
                name: wsName,
                slug: wsSlug,
                logo: wsLogo || undefined,
            });
            if (result.success) {
                toast.success(await getClientTranslation("Workspace updated successfully"));
                setActiveWorkspace({ ...activeWorkspace, name: wsName, slug: wsSlug, logo: wsLogo });
            } else {
                toast.error(await getClientTranslation(result.error || "Failed to update workspace"));
            }
        } catch (error) {
            toast.error(await getClientTranslation("An error occurred while updating workspace"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleNotificationToggle = (type: 'email' | 'push', key: string) => {
        setNotifications(prev => ({
            ...prev,
            [`${type}${key}`]: !prev[`${type}${key}` as keyof typeof prev]
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
            toast.success(await getClientTranslation("Notification settings saved"));
            setIsSaving(false);
        } else if (activeTab === "preferences") {
            toast.success(await getClientTranslation("Preferences saved"));
        } else {
            setIsSaving(true);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            setIsSaving(false);
            toast.success(await getClientTranslation("Settings saved successfully"));
        }
    };

    const handleLanguageChange = async (newLocale: string) => {
        const result = await updateUserLanguage(newLocale as SupportedLanguage);
        if (result.success) {
            toast.success(t("Preferences.Toast") || "Language updated successfully");
            // Navigate to the same path but with the new locale to update the UI shell
            router.push(pathname, { locale: newLocale });
        } else {
            toast.error(t("Error") || "Failed to update language");
        }
    };

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
                                            <img
                                                src={profileImage || profile.image}
                                                alt="Profile"
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
                                                        reader.onload = (e) => {
                                                            setProfileImage(e.target?.result as string);
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
                                            <ClientT>Email Address</ClientT>
                                        </label>
                                        <input
                                            type="email"
                                            value={profile.email}
                                            disabled
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed outline-none transition-all"
                                        />
                                        <p className="mt-1 text-xs text-gray-400 font-normal italic"><ClientT>Email cannot be changed. Contact support if needed.</ClientT></p>
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
                                            <ClientT>Saving...</ClientT>
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            <ClientT>Save Changes</ClientT>
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
                                <h2 className="text-lg font-semibold text-gray-900"><ClientT>Workspace Settings</ClientT></h2>
                                <p className="text-sm text-gray-500"><ClientT>Manage your workspace identification and branding.</ClientT></p>
                            </div>

                            <div className="p-6 space-y-6">
                                {!activeWorkspace ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {/* Workspace Logo */}
                                        <div className="flex items-center gap-5">
                                            <div className="relative">
                                                {wsLogo ? (
                                                    <img
                                                        src={wsLogo}
                                                        alt="Workspace Logo"
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
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                const reader = new FileReader();
                                                                reader.onload = (e) => {
                                                                    setWsLogo(e.target?.result as string);
                                                                };
                                                                reader.readAsDataURL(file);
                                                            }
                                                        }}
                                                    />
                                                </label>
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900"><ClientT>Workspace Logo</ClientT></p>
                                                <p className="text-xs text-gray-500"><ClientT>Upload a square image for your workspace.</ClientT></p>
                                                {wsLogo && (
                                                    <button
                                                        onClick={() => setWsLogo(null)}
                                                        className="text-xs text-red-500 hover:text-red-600 mt-1"
                                                    >
                                                        <ClientT>Remove</ClientT>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-5">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    <ClientT>Workspace Name</ClientT>
                                                </label>
                                                <input
                                                    type="text"
                                                    value={wsName}
                                                    onChange={(e) => setWsName(e.target.value)}
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    <ClientT>Workspace Slug</ClientT>
                                                </label>
                                                <div className="flex gap-2">
                                                    <span className="flex items-center px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 text-sm">
                                                        convy.app/
                                                    </span>
                                                    <input
                                                        type="text"
                                                        value={wsSlug}
                                                        onChange={(e) => setWsSlug(e.target.value)}
                                                        className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                                    />
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
                                        disabled={isSaving}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 shadow-sm"
                                    >
                                        {isSaving ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                <ClientT>Updating...</ClientT>
                                            </>
                                        ) : (
                                            <>
                                                <Check className="w-4 h-4" />
                                                <ClientT>Update Workspace</ClientT>
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
                                <h2 className="text-lg font-semibold text-gray-900"><ClientT>Notification Preferences</ClientT></h2>
                                <p className="text-sm text-gray-500"><ClientT>Choose how and when you want to be notified.</ClientT></p>
                            </div>
                            <div className="p-6">
                                <div className="space-y-6">
                                    {[
                                        {
                                            title: <ClientT>New Survey Response</ClientT>,
                                            description: <ClientT>Get notified when someone completes your survey.</ClientT>,
                                            key: "NewResponse"
                                        },
                                        {
                                            title: <ClientT>Weekly Summary</ClientT>,
                                            description: <ClientT>A weekly digest of your survey performance.</ClientT>,
                                            key: "WeeklySummary"
                                        },
                                        // Team Updates notification only shown in workspace context
                                        ...(isWorkspaceContext ? [{
                                            title: <ClientT>Team Updates</ClientT>,
                                            description: <ClientT>Notifications about team member changes.</ClientT>,
                                            key: "TeamUpdates"
                                        }] : []),
                                    ].map((item, index) => (
                                        <div key={index} className="flex items-start justify-between pb-6 border-b border-gray-100 last:border-0 last:pb-0">
                                            <div>
                                                <h3 className="font-medium text-gray-900">{item.title}</h3>
                                                <p className="text-sm text-gray-500 mt-1">{item.description}</p>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={notifications[`email${item.key}` as keyof typeof notifications]}
                                                        onChange={() => handleNotificationToggle('email', item.key)}
                                                    />
                                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${notifications[`email${item.key}` as keyof typeof notifications] ? 'bg-gray-900 border-gray-900' : 'border-gray-300 bg-white'}`}>
                                                        {notifications[`email${item.key}` as keyof typeof notifications] && <Check className="w-3.5 h-3.5 text-white" />}
                                                    </div>
                                                    <span className="text-sm text-gray-600 group-hover:text-gray-900"><ClientT>Email</ClientT></span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={notifications[`push${item.key}` as keyof typeof notifications]}
                                                        onChange={() => handleNotificationToggle('push', item.key)}
                                                    />
                                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${notifications[`push${item.key}` as keyof typeof notifications] ? 'bg-gray-900 border-gray-900' : 'border-gray-300 bg-white'}`}>
                                                        {notifications[`push${item.key}` as keyof typeof notifications] && <Check className="w-3.5 h-3.5 text-white" />}
                                                    </div>
                                                    <span className="text-sm text-gray-600 group-hover:text-gray-900"><ClientT>Push</ClientT></span>
                                                </label>
                                            </div>
                                        </div>
                                    ))}

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
                                            <ClientT>Saving...</ClientT>
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            <ClientT>Save Preferences</ClientT>
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
                                <h2 className="text-lg font-semibold text-gray-900"><ClientT>App Preferences</ClientT></h2>
                                <p className="text-sm text-gray-500"><ClientT>Customize your experience and regional settings.</ClientT></p>
                            </div>

                            <div className="p-6 space-y-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Globe className="w-5 h-5 text-gray-500" />
                                        <h3 className="font-medium text-gray-900">{t("Preferences.Language")}</h3>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {[
                                            { code: "en", name: "English", flag: "🇺🇸" },
                                            { code: "fr", name: "Français", flag: "🇫🇷" },
                                            { code: "de", name: "Deutsch", flag: "🇩🇪" },
                                            { code: "es", name: "Español", flag: "🇪🇸" },
                                            { code: "it", name: "Italiano", flag: "🇮🇹" },
                                        ].map((lang) => (
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

                    {activeTab === "billing" && (
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h2 className="text-lg font-semibold text-gray-900"><ClientT>Billing & Subscription</ClientT></h2>
                                <p className="text-sm text-gray-500"><ClientT>Manage your workspace plan and payment methods.</ClientT></p>
                            </div>
                            <div className="p-12 flex flex-col items-center justify-center text-center">
                                <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
                                    <CreditCard className="w-8 h-8 text-gray-400" />
                                </div>
                                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                    <ClientT>Current Plan:</ClientT> {activeWorkspace?.plan || "Free"}
                                </h3>
                                <p className="text-gray-500 max-w-sm mb-8">
                                    <ClientT>Billing management is coming soon. You are currently on the Free plan which includes up to 50 participants per survey.</ClientT>
                                </p>
                                <button
                                    disabled
                                    className="px-6 py-3 bg-gray-100 text-gray-400 rounded-xl font-medium cursor-not-allowed"
                                >
                                    <ClientT>Upgrade Plan</ClientT>
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
                                    <h2 className="text-lg font-semibold text-gray-900"><ClientT>Security Settings</ClientT></h2>
                                    <p className="text-sm text-gray-500"><ClientT>Manage your password and account security options.</ClientT></p>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            <ClientT>Current Password</ClientT>
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
                                            <ClientT>New Password</ClientT>
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
                                            <ClientT>Confirm New Password</ClientT>
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
                                                <ClientT>Updating...</ClientT>
                                            </>
                                        ) : (
                                            <>
                                                <Check className="w-4 h-4" />
                                                <ClientT>Update Password</ClientT>
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
                                            <h3 className="font-semibold text-gray-900"><ClientT>Two-Factor Authentication</ClientT></h3>
                                            <p className="text-sm text-gray-500 mt-1">
                                                <ClientT>Add an extra layer of security to your account.</ClientT>
                                            </p>
                                        </div>
                                    </div>
                                    <button className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                                        <ClientT>Enable</ClientT>
                                    </button>
                                </div>
                            </div>

                            {/* Danger Zone */}
                            <div className="bg-red-50 rounded-2xl border border-red-200 p-6">
                                <div className="flex items-start gap-4">
                                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                                    <div>
                                        <h3 className="font-semibold text-red-900"><ClientT>Delete Account</ClientT></h3>
                                        <p className="text-sm text-red-700 mt-1 mb-4">
                                            <ClientT>Permanently delete your account and all associated data. This action cannot be undone.</ClientT>
                                        </p>
                                        <button className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
                                            <ClientT>Delete Account</ClientT>
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
