import { T } from "@/components/i18n/t";
import { getTranslations, getLocale } from "next-intl/server";

export default async function CookiesPage() {
    const t = await getTranslations("Legal");
    const locale = await getLocale();

    return (
        <div className="max-w-none">
            {locale !== 'en' && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-8">
                    <p className="text-sm text-yellow-700"><T>{t("Disclaimer")}</T></p>
                </div>
            )}
            <h1 className="text-4xl font-bold mb-8 text-[#232323]"><T>{t("Cookies.Title")}</T></h1>
            <p className="text-[#666] mb-8"><T>{t("Cookies.LastUpdated")}</T></p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("Cookies.WhyUse")}</T></h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                <T>{t("Cookies.WhyUseText")}</T>
            </p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("Cookies.Necessary")}</T></h2>
            <div className="mb-6 bg-[#F0F4F8] p-6 rounded-2xl border border-[#D9E2EC] shadow-sm">
                <p className="text-[#232323] leading-relaxed text-lg">
                    <T>{t("Cookies.NecessaryText")}</T>
                </p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("Cookies.Improve")}</T></h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                <T>{t("Cookies.ImproveText")}</T>
            </p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("Cookies.Choices")}</T></h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                <T>{t("Cookies.ChoicesText")}</T>
            </p>
        </div>
    );
}
