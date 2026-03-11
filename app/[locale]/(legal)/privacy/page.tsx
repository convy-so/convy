import { T } from "@/components/i18n/t";
import { getTranslations, getLocale } from "next-intl/server";

export default async function PrivacyPage() {
    const t = await getTranslations("Legal.Privacy");
    const tGeneral = await getTranslations("Legal");
    const locale = await getLocale();

    return (
        <div className="max-w-none pb-20">
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
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li><T>{t("Preamble.Bullets.0")}</T></li>
                <li><T>{t("Preamble.Bullets.1")}</T></li>
                <li><T>{t("Preamble.Bullets.2")}</T></li>
            </ul>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S1.Title")}</T></h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("S1.P1")}</T></p>
            <div className="bg-[#F9FAFB] p-6 rounded-xl border border-gray-100 text-[#444] leading-relaxed text-lg mb-6 whitespace-pre-line">
                <T>{t("S1.Address")}</T>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S2.Title")}</T></h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S2.P1")}</T></p>

            <h3 className="text-xl font-medium mt-6 mb-3 text-[#232323]"><T>{t("S2.H21")}</T></h3>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li><T>{t("S2.B21.0")}</T></li>
                <li><T>{t("S2.B21.1")}</T></li>
                <li><T>{t("S2.B21.2")}</T></li>
                <li><T>{t("S2.B21.3")}</T></li>
                <li><T>{t("S2.B21.4")}</T></li>
                <li><T>{t("S2.B21.5")}</T></li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3 text-[#232323]"><T>{t("S2.H22")}</T></h3>
            <ul className="list-disc pl-6 mb-4 text-[#444] leading-relaxed text-lg space-y-2">
                <li><T>{t("S2.B22.0")}</T></li>
                <li><T>{t("S2.B22.1")}</T></li>
                <li><T>{t("S2.B22.2")}</T></li>
                <li><T>{t("S2.B22.3")}</T></li>
                <li><T>{t("S2.B22.4")}</T></li>
            </ul>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S2.P22")}</T></p>

            <h3 className="text-xl font-medium mt-6 mb-3 text-[#232323]"><T>{t("S2.H23")}</T></h3>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li><T>{t("S2.B23.0")}</T></li>
                <li><T>{t("S2.B23.1")}</T></li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3 text-[#232323]"><T>{t("S2.H24")}</T></h3>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("S2.P24")}</T></p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li><T>{t("S2.B24.0")}</T></li>
                <li><T>{t("S2.B24.1")}</T></li>
            </ul>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S3.Title")}</T></h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S3.P1")}</T></p>
            <div className="overflow-x-auto mb-6">
                <table className="w-full text-left border-collapse text-[#444]">
                    <thead>
                        <tr className="border-b-2 border-gray-200">
                            <th className="py-3 px-4 font-semibold text-[#232323]"><T>{t("S3.Table.Headers.0")}</T></th>
                            <th className="py-3 px-4 font-semibold text-[#232323]"><T>{t("S3.Table.Headers.1")}</T></th>
                            <th className="py-3 px-4 font-semibold text-[#232323]"><T>{t("S3.Table.Headers.2")}</T></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-lg">
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
                            <tr key={idx} className="hover:bg-[#F9FAFB] transition-colors">
                                <td className="py-3 px-4 font-medium"><T>{t(`S3.Table.Rows.${idx}.0`)}</T></td>
                                <td className="py-3 px-4"><T>{t(`S3.Table.Rows.${idx}.1`)}</T></td>
                                <td className="py-3 px-4"><T>{t(`S3.Table.Rows.${idx}.2`)}</T></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S4.Title")}</T></h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("S4.P1")}</T></p>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("S4.P2")}</T></p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li><T>{t("S4.B1.0")}</T></li>
                <li><T>{t("S4.B1.1")}</T></li>
                <li><T>{t("S4.B1.2")}</T></li>
            </ul>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("S4.P3")}</T></p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li><T>{t("S4.B2.0")}</T></li>
                <li><T>{t("S4.B2.1")}</T></li>
                <li><T>{t("S4.B2.2")}</T></li>
                <li><T>{t("S4.B2.3")}</T></li>
            </ul>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("S4.P4")}</T></p>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S4.P5")}</T></p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S5.Title")}</T></h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("S5.P1")}</T></p>
            <div className="space-y-6 mb-6 text-[#444] leading-relaxed text-lg">
                <div>
                    <strong className="text-[#232323] block mb-2"><T>{t("S5.StrictlyNecessary")}</T></strong>
                    <p><T>{t("S5.StrictlyNecessaryText")}</T></p>
                </div>
                <div>
                    <strong className="text-[#232323] block mb-2"><T>{t("S5.Analytics")}</T></strong>
                    <p><T>{t("S5.AnalyticsText")}</T></p>
                </div>
                <div>
                    <strong className="text-[#232323] block mb-2"><T>{t("S5.Marketing")}</T></strong>
                    <p><T>{t("S5.MarketingText")}</T></p>
                </div>
                <p><T>{t("S5.Footer")}</T></p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S6.Title")}</T></h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("S6.P1")}</T></p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li><T>{t("S6.B1.0")}</T></li>
                <li><T>{t("S6.B1.1")}</T></li>
                <li><T>{t("S6.B1.2")}</T></li>
                <li><T>{t("S6.B1.3")}</T></li>
                <li><T>{t("S6.B1.4")}</T></li>
            </ul>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("S6.P2")}</T></p>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S6.P3")}</T></p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S7.Title")}</T></h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S7.P1")}</T></p>
            <div className="overflow-x-auto mb-6">
                <table className="w-full text-left border-collapse text-[#444]">
                    <thead>
                        <tr className="border-b-2 border-gray-200">
                            <th className="py-3 px-4 font-semibold text-[#232323]"><T>{t("S7.Table.Headers.0")}</T></th>
                            <th className="py-3 px-4 font-semibold text-[#232323]"><T>{t("S7.Table.Headers.1")}</T></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-lg">
                        {[0, 1, 2, 3, 4, 5, 6].map((idx) => (
                            <tr key={idx} className="hover:bg-[#F9FAFB] transition-colors">
                                <td className="py-3 px-4 font-medium"><T>{t(`S7.Table.Rows.${idx}.0`)}</T></td>
                                <td className="py-3 px-4"><T>{t(`S7.Table.Rows.${idx}.1`)}</T></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S7.P2")}</T></p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S8.Title")}</T></h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("S8.P1")}</T></p>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S8.P2")}</T></p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S9.Title")}</T></h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("S9.P1")}</T></p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li><T>{t("S9.B1.0")}</T></li>
                <li><T>{t("S9.B1.1")}</T></li>
                <li><T>{t("S9.B1.2")}</T></li>
                <li><T>{t("S9.B1.3")}</T></li>
                <li><T>{t("S9.B1.4")}</T></li>
                <li><T>{t("S9.B1.5")}</T></li>
                <li><T>{t("S9.B1.6")}</T></li>
                <li><T>{t("S9.B1.7")}</T></li>
            </ul>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S9.P2")}</T></p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S10.Title")}</T></h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("S10.P1")}</T></p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li><T>{t("S10.B1.0")}</T></li>
                <li><T>{t("S10.B1.1")}</T></li>
                <li><T>{t("S10.B1.2")}</T></li>
                <li><T>{t("S10.B1.3")}</T></li>
            </ul>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S10.P2")}</T></p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S11.Title")}</T></h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg"><T>{t("S11.P1")}</T></p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li><T>{t("S11.B1.0")}</T></li>
                <li><T>{t("S11.B1.1")}</T></li>
                <li><T>{t("S11.B1.2")}</T></li>
                <li><T>{t("S11.B1.3")}</T></li>
            </ul>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S12.Title")}</T></h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S12.P1")}</T></p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S13.Title")}</T></h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S13.P1")}</T></p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]"><T>{t("S14.Title")}</T></h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg"><T>{t("S14.P1")}</T></p>
        </div>
    );
}
