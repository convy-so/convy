"use client";

import { useState } from "react";
import {
    User,
    Bell,
    Shield,
    CreditCard,
    Key,
    Mail,
    Smartphone,
    Check,
    Loader2,
    Camera,
    AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
    { id: "profile", name: "Profile", icon: User },
    { id: "notifications", name: "Notifications", icon: Bell },
    { id: "security", name: "Security", icon: Shield },
    { id: "billing", name: "Billing", icon: CreditCard },
];

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState("profile");
    const [isSaving, setIsSaving] = useState(false);
    const [profileImage, setProfileImage] = useState<string | null>(null);

    // Mock user data
    const [profile, setProfile] = useState({
        name: "User Name",
        email: "user@example.com",
        company: "Acme Inc.",
        timezone: "UTC-5 (Eastern Time)",
    });

    const [notifications, setNotifications] = useState({
        emailNewResponse: true,
        emailWeeklySummary: true,
        emailTeamUpdates: false,
        pushNewResponse: true,
        pushSurveyComplete: true,
    });

    const handleSave = async () => {
        setIsSaving(true);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setIsSaving(false);
    };

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Settings</h1>
                <p className="text-gray-500 mt-1">
                    Manage your account preferences and settings
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
                                <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>
                                <p className="text-sm text-gray-500">Update your personal details</p>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Avatar */}
                                <div className="flex items-center gap-5">
                                    <div className="relative">
                                        {profileImage ? (
                                            <img 
                                                src={profileImage} 
                                                alt="Profile" 
                                                className="w-20 h-20 rounded-2xl object-cover"
                                            />
                                        ) : (
                                            <div className="w-20 h-20 rounded-2xl bg-blue-800 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
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
                                            Remove photo
                                        </button>
                                    </div>
                                </div>

                                {/* Form Fields */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Full Name
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
                                            Email Address
                                        </label>
                                        <input
                                            type="email"
                                            value={profile.email}
                                            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Company
                                        </label>
                                        <input
                                            type="text"
                                            value={profile.company}
                                            onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                        />
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
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            Save Changes
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Notifications Tab */}
                    {activeTab === "notifications" && (
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h2 className="text-lg font-semibold text-gray-900">Notification Preferences</h2>
                                <p className="text-sm text-gray-500">Choose how you want to be notified</p>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Email Notifications */}
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Mail className="w-5 h-5 text-gray-500" />
                                        <h3 className="font-medium text-gray-900">Email Notifications</h3>
                                    </div>
                                    <div className="space-y-3">
                                        {[
                                            { key: "emailNewResponse", label: "New survey responses", desc: "Get notified when someone completes your survey" },
                                            { key: "emailWeeklySummary", label: "Weekly summary", desc: "Receive a weekly digest of your survey analytics" },
                                            { key: "emailTeamUpdates", label: "Team updates", desc: "Get notified about team member actions" },
                                        ].map((item) => (
                                            <label
                                                key={item.key}
                                                className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={notifications[item.key as keyof typeof notifications]}
                                                    onChange={(e) =>
                                                        setNotifications({ ...notifications, [item.key]: e.target.checked })
                                                    }
                                                    className="mt-1 w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                                />
                                                <div>
                                                    <p className="font-medium text-gray-900">{item.label}</p>
                                                    <p className="text-sm text-gray-500">{item.desc}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Push Notifications */}
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Smartphone className="w-5 h-5 text-gray-500" />
                                        <h3 className="font-medium text-gray-900">Push Notifications</h3>
                                    </div>
                                    <div className="space-y-3">
                                        {[
                                            { key: "pushNewResponse", label: "New responses", desc: "Real-time alerts for new responses" },
                                            { key: "pushSurveyComplete", label: "Survey milestones", desc: "When surveys reach response goals" },
                                        ].map((item) => (
                                            <label
                                                key={item.key}
                                                className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={notifications[item.key as keyof typeof notifications]}
                                                    onChange={(e) =>
                                                        setNotifications({ ...notifications, [item.key]: e.target.checked })
                                                    }
                                                    className="mt-1 w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                                />
                                                <div>
                                                    <p className="font-medium text-gray-900">{item.label}</p>
                                                    <p className="text-sm text-gray-500">{item.desc}</p>
                                                </div>
                                            </label>
                                        ))}
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
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            Save Changes
                                        </>
                                    )}
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
                                    <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
                                    <p className="text-sm text-gray-500">Update your account password</p>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Current Password
                                        </label>
                                        <input
                                            type="password"
                                            placeholder="••••••••"
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            New Password
                                        </label>
                                        <input
                                            type="password"
                                            placeholder="••••••••"
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Confirm New Password
                                        </label>
                                        <input
                                            type="password"
                                            placeholder="••••••••"
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
                                    <button className="px-5 py-2.5 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors">
                                        Update Password
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
                                            <h3 className="font-semibold text-gray-900">Two-Factor Authentication</h3>
                                            <p className="text-sm text-gray-500 mt-1">
                                                Add an extra layer of security to your account
                                            </p>
                                        </div>
                                    </div>
                                    <button className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                                        Enable
                                    </button>
                                </div>
                            </div>

                            {/* Danger Zone */}
                            <div className="bg-red-50 rounded-2xl border border-red-200 p-6">
                                <div className="flex items-start gap-4">
                                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                                    <div>
                                        <h3 className="font-semibold text-red-900">Delete Account</h3>
                                        <p className="text-sm text-red-700 mt-1 mb-4">
                                            Once you delete your account, there is no going back. Please be certain.
                                        </p>
                                        <button className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
                                            Delete Account
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Billing Tab */}
                    {activeTab === "billing" && (
                        <div className="space-y-6">
                            {/* Current Plan */}
                            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <p className="text-sm text-gray-300 mb-1">Current Plan</p>
                                        <h2 className="text-2xl font-bold">Enterprise (Test Mode)</h2>
                                    </div>
                                    <span className="px-3 py-1 bg-white/10 rounded-full text-sm font-medium">
                                        Active
                                    </span>
                                </div>
                                <p className="text-gray-300 mb-6">
                                    Billing is currently frozen for testing. You have full access to all features.
                                </p>
                                <button disabled className="w-full py-3 bg-gray-600 text-gray-300 rounded-xl font-semibold cursor-not-allowed">
                                    Billing Disabled
                                </button>
                            </div>

                            {/* Usage */}
                            <div className="bg-white rounded-2xl border border-gray-100 p-6">
                                <h3 className="font-semibold text-gray-900 mb-4">Usage This Month</h3>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm text-gray-600">Surveys</span>
                                            <span className="text-sm font-medium text-gray-900">Unlimited</span>
                                        </div>
                                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full w-full bg-blue-500 rounded-full" />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm text-gray-600">Responses</span>
                                            <span className="text-sm font-medium text-gray-900">Unlimited</span>
                                        </div>
                                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full w-full bg-purple-500 rounded-full" />
                                        </div>
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
