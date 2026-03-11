import { T } from "@/components/i18n/t";
import { getTranslations, getLocale } from "next-intl/server";

export default async function TermsPage() {
    const t = await getTranslations({locale: 'en', namespace: "Legal.Terms"});
    const tGeneral = await getTranslations({locale: 'en', namespace: "Legal"});
    const locale = await getLocale();

    return (
        <div className="max-w-none">
            {locale !== 'en' && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-8">
                    <p className="text-sm text-yellow-700"><T>{tGeneral("Disclaimer")}</T></p>
                </div>
            )}
            <h1 className="text-4xl font-bold mb-4 text-[#232323]"><T>{t("Title")}</T></h1>
            <div className="text-[#666] mb-8 space-y-1">
                <p><T>{t("Dates.Updated")}</T></p>
                <p><T>{t("Dates.Effective")}</T></p>
                <p><T>{t("Dates.Version")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("Preamble.Title")}</T></h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("Preamble.P1")}</T></p>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("Preamble.P2")}</T></p>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("Preamble.P3")}</T></p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S1.Title")}</T></h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("S1.P1")}</T></p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li><T>{t("S1.B1.0")}</T></li>
                <li><T>{t("S1.B1.1")}</T></li>
                <li><T>{t("S1.B1.2")}</T></li>
                <li><T>{t("S1.B1.3")}</T></li>
                <li><T>{t("S1.B1.4")}</T></li>
                <li><T>{t("S1.B1.5")}</T></li>
                <li><T>{t("S1.B1.6")}</T></li>
                <li><T>{t("S1.B1.7")}</T></li>
            </ul>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S2.Title")}</T></h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p><T>{t("S2.P21")}</T></p>
                <p><T>{t("S2.P22")}</T></p>
                <p><T>{t("S2.P23")}</T></p>
                <p><T>{t("S2.P24")}</T></p>
                <p><T>{t("S2.P25")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S3.Title")}</T></h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p><T>{t("S3.P31")}</T></p>
                <p><T>{t("S3.P32")}</T></p>
                <ul className="list-[lower-alpha] pl-6 space-y-2">
                    <li><T>{t("S3.B32.0")}</T></li>
                    <li><T>{t("S3.B32.1")}</T></li>
                    <li><T>{t("S3.B32.2")}</T></li>
                    <li><T>{t("S3.B32.3")}</T></li>
                </ul>
                <p><T>{t("S3.P33")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S4.Title")}</T></h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p><T>{t("S4.P41")}</T></p>
                <p><T>{t("S4.P42")}</T></p>
                <ul className="list-[lower-alpha] pl-6 space-y-2">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((idx) => (
                        <li key={idx}><T>{t(`S4.B42.${idx}`)}</T></li>
                    ))}
                </ul>
                <p><T>{t("S4.P43")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S5.Title")}</T></h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p><T>{t("S5.P51")}</T></p>
                <p><T>{t("S5.P52")}</T></p>
                <ul className="list-disc pl-6 space-y-2">
                    {[0, 1, 2, 3].map((idx) => (
                        <li key={idx}><T>{t(`S5.B52.${idx}`)}</T></li>
                    ))}
                </ul>
                <p><T>{t("S5.P53")}</T></p>
                <ul className="list-disc pl-6 space-y-2">
                    {[0, 1, 2, 3].map((idx) => (
                        <li key={idx}><T>{t(`S5.B53.${idx}`)}</T></li>
                    ))}
                </ul>
                <p><T>{t("S5.P54")}</T></p>
                <p><T>{t("S5.P55")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S6.Title")}</T></h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p><T>{t("S6.P61")}</T></p>
                <p><T>{t("S6.P62")}</T></p>
                <p><T>{t("S6.P63")}</T></p>
                <p><T>{t("S6.P64")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S7.Title")}</T></h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p><T>{t("S7.P71")}</T></p>
                <p><T>{t("S7.P72")}</T></p>
                <p><T>{t("S7.P73")}</T></p>
                <p><T>{t("S7.P74")}</T></p>
                <p><T>{t("S7.P75")}</T></p>
                <p><T>{t("S7.P76")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S8.Title")}</T></h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p><T>{t("S8.P81")}</T></p>
                <p><T>{t("S8.P82")}</T></p>
                <p><T>{t("S8.P83")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S9.Title")}</T></h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p><T>{t("S9.P91")}</T></p>
                <p><T>{t("S9.P92")}</T></p>
                <p><T>{t("S9.P93")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S10.Title")}</T></h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p><T>{t("S10.P101")}</T></p>
                <p><T>{t("S10.P102")}</T></p>
                <p><T>{t("S10.P103")}</T></p>
                <p><T>{t("S10.P104")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S11.Title")}</T></h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p><T>{t("S11.P111")}</T></p>
                <p><T>{t("S11.P112")}</T></p>
                <p><T>{t("S11.P113")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S12.Title")}</T></h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S12.P121")}</T></p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S13.Title")}</T></h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p><T>{t("S13.P131")}</T></p>
                <p><T>{t("S13.P132")}</T></p>
                <p><T>{t("S13.P133")}</T></p>
                <p><T>{t("S13.P134")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S14.Title")}</T></h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p><T>{t("S14.P141")}</T></p>
                <p><T>{t("S14.P142")}</T></p>
                <p><T>{t("S14.P143")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S15.Title")}</T></h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p><T>{t("S15.P151")}</T></p>
                <p><T>{t("S15.P152")}</T></p>
                <p><T>{t("S15.P153")}</T></p>
                <p><T>{t("S15.P154")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S16.Title")}</T></h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S16.P161")}</T></p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S17.Title")}</T></h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S17.P171")}</T></p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S18.Title")}</T></h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p><T>{t("S18.P181")}</T></p>
                <p><T>{t("S18.P182")}</T></p>
                <p><T>{t("S18.P183")}</T></p>
                <p><T>{t("S18.P184")}</T></p>
                <p><T>{t("S18.P185")}</T></p>
            </div>
        </div>
    );
}
