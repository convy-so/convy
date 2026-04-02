import { getTranslations, getLocale } from "next-intl/server";

export default async function CookiesPage() {
    const locale = await getLocale();
    const t = await getTranslations({ locale, namespace: "Legal" });

    return (
        <div className="max-w-none">
            {locale !== 'en' && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-8">
                    <p className="text-sm text-yellow-700">{t("Disclaimer")}</p>
                </div>
            )}
            <h1 className="text-4xl font-bold mb-8 text-[#232323]">{t("Cookies.Title")}</h1>
            <p className="text-[#666] mb-8">{t("Cookies.LastUpdated")}</p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("Cookies.WhyUse")}</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                {t("Cookies.WhyUseText")}
            </p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("Cookies.Necessary")}</h2>
            <div className="mb-6 bg-[#F0F4F8] p-6 rounded-2xl border border-[#D9E2EC] shadow-sm">
                <p className="text-[#232323] leading-relaxed text-lg">
                    {t("Cookies.NecessaryText")}
                </p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("Cookies.Improve")}</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                {t("Cookies.ImproveText")}
            </p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("Cookies.Choices")}</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                {t("Cookies.ChoicesText")}
            </p>
        </div>
    );
}
