"use client";

import Image from "next/image";
import { Link } from "@/i18n/routing";
import { useAuth } from "@/features/auth/ui/auth-provider";
import { useTranslations } from "next-intl";

export function ProfileContent() {
    const { user } = useAuth();
    const t = useTranslations("Profile");

    if (!user) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold text-gray-900">{t("Title")}</h1>
            </div>

            {/* Profile Header Card */}
            <div className="bg-white rounded-3xl border border-gray-100 p-8 flex flex-col md:flex-row items-center md:items-start gap-8">
                <div className="relative group">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-gray-50 bg-gray-50 flex items-center justify-center">
                        {user.image ? (
                            <Image
                                src={user.image}
                                alt={user.name ?? ""}
                                width={96}
                                height={96}
                                unoptimized
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full bg-indigo-600 flex items-center justify-center text-white text-3xl font-medium uppercase">
                                {user.name?.charAt(0)}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 text-center md:text-left space-y-1">
                    <h2 className="text-2xl font-semibold text-gray-900">{user.name}</h2>
                    <p className="text-sm font-medium text-gray-500">
                        {t("DefaultRole")}
                    </p>
                </div>

                <div className="flex gap-3">
                    <Link
                        href="/dashboard/settings"
                        className="px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all font-sans"
                    >
                        {t("EditButton")}
                    </Link>
                </div>
            </div>

            {/* Personal Information */}
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
                <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">{t("PersonalInfo")}</h3>
                </div>

                <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-8 gap-x-12">
                    <div>
                        <label className="text-[10px] font-medium text-gray-400 uppercase tracking-widest block mb-1">{t("FirstName")}</label>
                        <p className="text-gray-900 font-medium">{user.name?.split(' ')[0] || '-'}</p>
                    </div>
                    <div>
                        <label className="text-[10px] font-medium text-gray-400 uppercase tracking-widest block mb-1">{t("LastName")}</label>
                        <p className="text-gray-900 font-medium">{user.name?.split(' ').slice(1).join(' ') || '-'}</p>
                    </div>
                    <div>
                        <label className="text-[10px] font-medium text-gray-400 uppercase tracking-widest block mb-1">{t("Email")}</label>
                        <p className="text-gray-900 font-medium">{user.email}</p>
                    </div>
                    <div>
                        <label className="text-[10px] font-medium text-gray-400 uppercase tracking-widest block mb-1">{t("JoinDate")}</label>
                        <p className="text-gray-900 font-medium">{new Date(user.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                        <label className="text-[10px] font-medium text-gray-400 uppercase tracking-widest block mb-1">{t("UserRole")}</label>
                        <p className="text-gray-900 font-medium capitalize">
                            {t("DefaultRole")}
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
}
