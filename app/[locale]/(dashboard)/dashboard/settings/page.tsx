"use client";

import { useEffect, useState } from "react";
import { Bell, Globe, LogOut, Save, User } from "lucide-react";
import toast from "react-hot-toast";

import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/components/providers/auth-provider";

const supportedLanguages = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
] as const;

export default function SettingsPage() {
  const { user } = useAuth();
  const [language, setLanguage] = useState("en");
  const [isSaving, setIsSaving] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadPreferences = async () => {
      try {
        const response = await fetch("/api/user/language", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && typeof data.language === "string") {
          setLanguage(data.language);
        }
      } catch (error) {
        console.error("[settings] failed to load language preference", error);
      }
    };

    void loadPreferences();

    return () => {
      cancelled = true;
    };
  }, []);

  const savePreferences = async () => {
    setIsSaving(true);

    try {
      const response = await fetch("/api/user/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });

      if (!response.ok) {
        throw new Error("Failed to save preferences");
      }

      toast.success("Preferences updated");
    } catch (error) {
      console.error("[settings] failed to save preferences", error);
      toast.error("Failed to save preferences");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      window.location.href = "/";
    } catch (error) {
      console.error("[settings] sign out failed", error);
      toast.error("Failed to sign out");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account preferences for the V1 platform experience.
        </p>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-gray-100 p-2 text-gray-700">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-medium text-gray-900">Account</h2>
            <p className="text-sm text-gray-500">Basic identity details.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Name</label>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900">
              {user?.name ?? "-"}
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Email</label>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900">
              {user?.email ?? "-"}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-gray-100 p-2 text-gray-700">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-medium text-gray-900">Language</h2>
            <p className="text-sm text-gray-500">
              Choose the interface language used across the app.
            </p>
          </div>
        </div>

        <label className="mb-2 block text-sm font-medium text-gray-700">
          Preferred language
        </label>
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-gray-300 focus:ring-2 focus:ring-gray-900/10"
        >
          {supportedLanguages.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-gray-100 p-2 text-gray-700">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-medium text-gray-900">Notifications</h2>
            <p className="text-sm text-gray-500">
              Lightweight preference placeholder for V1 notification controls.
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
          <span className="text-sm text-gray-900">
            Notify me when students finish sessions or new survey responses arrive
          </span>
          <input
            type="checkbox"
            checked={notificationsEnabled}
            onChange={(event) => setNotificationsEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
          />
        </label>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>

        <button
          type="button"
          onClick={savePreferences}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save preferences"}
        </button>
      </div>
    </div>
  );
}
