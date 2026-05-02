"use client";

import { useEffect, useState, useRef } from "react";
import { Bell, Globe, LogOut, Save, User, ChevronDown, Check } from "lucide-react";
import toast from "react-hot-toast";

import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/components/providers/auth-provider";

const supportedLanguages = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "de", label: "Germany" },
] as const;

function CustomSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { label: string; value: T }[];
  onChange: (val: T) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-200 transition-all outline-none focus:border-slate-200 focus:bg-white"
      >
        <span className="truncate">{selectedOption?.label ?? "Select..."}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full z-50 bg-white border border-slate-100 rounded-xl overflow-hidden py-1 shadow-sm">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors text-left"
            >
              <div className={value === opt.value ? "text-slate-900" : "text-slate-700"}>
                {opt.label}
              </div>
              {value === opt.value && <Check className="h-4 w-4 text-slate-900 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
        method: "PATCH",
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
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your account preferences for the V1 platform experience.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-100 bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-slate-50 p-2 text-slate-700 border border-slate-100">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-medium text-slate-900">Account</h2>
            <p className="text-sm text-slate-500">Basic identity details.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Name</label>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm text-slate-900">
              {user?.name ?? "-"}
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm text-slate-900">
              {user?.email ?? "-"}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-slate-50 p-2 text-slate-700 border border-slate-100">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-medium text-slate-900">Language</h2>
            <p className="text-sm text-slate-500">
              Choose the interface language used across the app.
            </p>
          </div>
        </div>

        <label className="mb-2 block text-sm font-medium text-slate-700">
          Preferred language
        </label>
        <CustomSelect
          value={language}
          options={supportedLanguages}
          onChange={setLanguage}
        />
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-slate-50 p-2 text-slate-700 border border-slate-100">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-medium text-slate-900">Notifications</h2>
            <p className="text-sm text-slate-500">
              Lightweight preference placeholder for V1 notification controls.
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
          <span className="text-sm font-medium text-slate-700">
            Notify me when students finish sessions or new survey responses arrive
          </span>
          <input
            type="checkbox"
            checked={notificationsEnabled}
            onChange={(event) => setNotificationsEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
          />
        </label>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between pt-4">
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-6 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>

        <button
          type="button"
          onClick={savePreferences}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save preferences"}
        </button>
      </div>
    </div>
  );
}
