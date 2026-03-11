import { getTranslations, getLocale } from "next-intl/server";

export default async function TermsPage() {
    const t = await getTranslations("Legal.Terms");
    const tGeneral = await getTranslations("Legal");
    const locale = await getLocale();

    return (
        <div className="max-w-none">
            {locale !== 'en' && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-8">
                    <p className="text-sm text-yellow-700">{tGeneral("Disclaimer")}</p>
                </div>
            )}
            <h1 className="text-4xl font-bold mb-4 text-[#232323]">{t("Title")}</h1>
            <div className="text-[#666] mb-8 space-y-1">
                <p>{t("Dates.Updated")}</p>
                <p>{t("Dates.Effective")}</p>
                <p>{t("Dates.Version")}</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("Preamble.Title")}</h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">{t("Preamble.P1")}</p>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">{t("Preamble.P2")}</p>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">{t("Preamble.P3")}</p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S1.Title")}</h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">{t("S1.P1")}</p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li>{t("S1.B1.0")}</li>
                <li>{t("S1.B1.1")}</li>
                <li>{t("S1.B1.2")}</li>
                <li>{t("S1.B1.3")}</li>
                <li>{t("S1.B1.4")}</li>
                <li>{t("S1.B1.5")}</li>
                <li>{t("S1.B1.6")}</li>
                <li>{t("S1.B1.7")}</li>
            </ul>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S2.Title")}</h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p>{t("S2.P21")}</p>
                <p>{t("S2.P22")}</p>
                <p>{t("S2.P23")}</p>
                <p>{t("S2.P24")}</p>
                <p>{t("S2.P25")}</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S3.Title")}</h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p>{t("S3.P31")}</p>
                <p>{t("S3.P32")}</p>
                <ul className="list-[lower-alpha] pl-6 space-y-2">
                    <li>{t("S3.B32.0")}</li>
                    <li>{t("S3.B32.1")}</li>
                    <li>{t("S3.B32.2")}</li>
                    <li>{t("S3.B32.3")}</li>
                </ul>
                <p>{t("S3.P33")}</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S4.Title")}</h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p>{t("S4.P41")}</p>
                <p>{t("S4.P42")}</p>
                <ul className="list-[lower-alpha] pl-6 space-y-2">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((idx) => (
                        <li key={idx}>{t(`S4.B42.${idx}`)}</li>
                    ))}
                </ul>
                <p>{t("S4.P43")}</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S5.Title")}</h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p>{t("S5.P51")}</p>
                <p>{t("S5.P52")}</p>
                <ul className="list-disc pl-6 space-y-2">
                    {[0, 1, 2, 3].map((idx) => (
                        <li key={idx}>{t(`S5.B52.${idx}`)}</li>
                    ))}
                </ul>
                <p>{t("S5.P53")}</p>
                <ul className="list-disc pl-6 space-y-2">
                    {[0, 1, 2, 3].map((idx) => (
                        <li key={idx}>{t(`S5.B53.${idx}`)}</li>
                    ))}
                </ul>
                <p>{t("S5.P54")}</p>
                <p>{t("S5.P55")}</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S6.Title")}</h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p>{t("S6.P61")}</p>
                <p>{t("S6.P62")}</p>
                <p>{t("S6.P63")}</p>
                <p>{t("S6.P64")}</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S7.Title")}</h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p>{t("S7.P71")}</p>
                <p>{t("S7.P72")}</p>
                <p>{t("S7.P73")}</p>
                <p>{t("S7.P74")}</p>
                <p>{t("S7.P75")}</p>
                <p>{t("S7.P76")}</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S8.Title")}</h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p>{t("S8.P81")}</p>
                <p>{t("S8.P82")}</p>
                <p>{t("S8.P83")}</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S9.Title")}</h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p>{t("S9.P91")}</p>
                <p>{t("S9.P92")}</p>
                <p>{t("S9.P93")}</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S10.Title")}</h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p>{t("S10.P101")}</p>
                <p>{t("S10.P102")}</p>
                <p>{t("S10.P103")}</p>
                <p>{t("S10.P104")}</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S11.Title")}</h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p>{t("S11.P111")}</p>
                <p>{t("S11.P112")}</p>
                <p>{t("S11.P113")}</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S12.Title")}</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">{t("S12.P121")}</p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S13.Title")}</h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p>{t("S13.P131")}</p>
                <p>{t("S13.P132")}</p>
                <p>{t("S13.P133")}</p>
                <p>{t("S13.P134")}</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S14.Title")}</h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p>{t("S14.P141")}</p>
                <p>{t("S14.P142")}</p>
                <p>{t("S14.P143")}</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S15.Title")}</h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p>{t("S15.P151")}</p>
                <p>{t("S15.P152")}</p>
                <p>{t("S15.P153")}</p>
                <p>{t("S15.P154")}</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S16.Title")}</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">{t("S16.P161")}</p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S17.Title")}</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">{t("S17.P171")}</p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">{t("S18.Title")}</h2>
            <div className="space-y-4 text-[#444] leading-relaxed text-lg mb-6">
                <p>{t("S18.P181")}</p>
                <p>{t("S18.P182")}</p>
                <p>{t("S18.P183")}</p>
                <p>{t("S18.P184")}</p>
                <p>{t("S18.P185")}</p>
            </div>
        </div>
    );
}
