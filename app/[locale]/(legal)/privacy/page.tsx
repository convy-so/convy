import { getLocale, getTranslations } from "next-intl/server";

export default async function PrivacyPage() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "Legal.Privacy" });
  const tGeneral = await getTranslations({ locale, namespace: "Legal" });

  return (
    <div className="max-w-none pb-20">
      {locale !== "en" && (
        <div className="mb-8 border-l-4 border-yellow-400 bg-yellow-50 p-4">
          <p className="text-sm text-yellow-700">{tGeneral("Disclaimer")}</p>
        </div>
      )}

      <h1 className="mb-4 text-4xl font-bold text-[#232323]">{t("Title")}</h1>
      <div className="mb-8 space-y-1 text-[#666]">
        <p>{t("Dates.Updated")}</p>
        <p>{t("Dates.Effective")}</p>
        <p>{t("Dates.Version")}</p>
      </div>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("Preamble.Title")}</h2>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("Preamble.P1")}</p>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("Preamble.P2")}</p>
      <ul className="mb-6 list-disc space-y-2 pl-6 text-lg leading-relaxed text-[#444]">
        <li>{t("Preamble.Bullets.0")}</li>
        <li>{t("Preamble.Bullets.1")}</li>
        <li>{t("Preamble.Bullets.2")}</li>
      </ul>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("S1.Title")}</h2>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("S1.P1")}</p>
      <div className="mb-6 whitespace-pre-line rounded-xl border border-gray-100 bg-[#F9FAFB] p-6 text-lg leading-relaxed text-[#444]">
        {t("S1.Address")}
      </div>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("S2.Title")}</h2>
      <p className="mb-6 text-lg leading-relaxed text-[#444]">{t("S2.P1")}</p>

      <h3 className="mt-6 mb-3 text-xl font-medium text-[#232323]">{t("S2.H21")}</h3>
      <ul className="mb-6 list-disc space-y-2 pl-6 text-lg leading-relaxed text-[#444]">
        <li>{t("S2.B21.0")}</li>
        <li>{t("S2.B21.1")}</li>
        <li>{t("S2.B21.2")}</li>
        <li>{t("S2.B21.3")}</li>
        <li>{t("S2.B21.4")}</li>
        <li>{t("S2.B21.5")}</li>
      </ul>

      <h3 className="mt-6 mb-3 text-xl font-medium text-[#232323]">{t("S2.H22")}</h3>
      <ul className="mb-4 list-disc space-y-2 pl-6 text-lg leading-relaxed text-[#444]">
        <li>{t("S2.B22.0")}</li>
        <li>{t("S2.B22.1")}</li>
        <li>{t("S2.B22.2")}</li>
        <li>{t("S2.B22.3")}</li>
        <li>{t("S2.B22.4")}</li>
      </ul>
      <p className="mb-6 text-lg leading-relaxed text-[#444]">{t("S2.P22")}</p>

      <h3 className="mt-6 mb-3 text-xl font-medium text-[#232323]">{t("S2.H23")}</h3>
      <ul className="mb-6 list-disc space-y-2 pl-6 text-lg leading-relaxed text-[#444]">
        <li>{t("S2.B23.0")}</li>
        <li>{t("S2.B23.1")}</li>
      </ul>

      <h3 className="mt-6 mb-3 text-xl font-medium text-[#232323]">{t("S2.H24")}</h3>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("S2.P24")}</p>
      <ul className="mb-6 list-disc space-y-2 pl-6 text-lg leading-relaxed text-[#444]">
        <li>{t("S2.B24.0")}</li>
        <li>{t("S2.B24.1")}</li>
      </ul>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("S3.Title")}</h2>
      <p className="mb-6 text-lg leading-relaxed text-[#444]">{t("S3.P1")}</p>
      <div className="mb-6 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[#444]">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="py-3 px-4 font-semibold text-[#232323]">{t("S3.Table.Headers.0")}</th>
              <th className="py-3 px-4 font-semibold text-[#232323]">{t("S3.Table.Headers.1")}</th>
              <th className="py-3 px-4 font-semibold text-[#232323]">{t("S3.Table.Headers.2")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-lg">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
              <tr key={idx} className="transition-colors hover:bg-[#F9FAFB]">
                <td className="py-3 px-4 font-medium">{t(`S3.Table.Rows.${idx}.0`)}</td>
                <td className="py-3 px-4">{t(`S3.Table.Rows.${idx}.1`)}</td>
                <td className="py-3 px-4">{t(`S3.Table.Rows.${idx}.2`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("S4.Title")}</h2>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("S4.P1")}</p>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("S4.P2")}</p>
      <ul className="mb-6 list-disc space-y-2 pl-6 text-lg leading-relaxed text-[#444]">
        <li>{t("S4.B1.0")}</li>
        <li>{t("S4.B1.1")}</li>
        <li>{t("S4.B1.2")}</li>
      </ul>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("S4.P3")}</p>
      <ul className="mb-6 list-disc space-y-2 pl-6 text-lg leading-relaxed text-[#444]">
        <li>{t("S4.B2.0")}</li>
        <li>{t("S4.B2.1")}</li>
        <li>{t("S4.B2.2")}</li>
        <li>{t("S4.B2.3")}</li>
      </ul>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("S4.P4")}</p>
      <p className="mb-6 text-lg leading-relaxed text-[#444]">{t("S4.P5")}</p>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("S5.Title")}</h2>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("S5.P1")}</p>
      <div className="mb-6 space-y-6 text-lg leading-relaxed text-[#444]">
        <div>
          <strong className="mb-2 block text-[#232323]">{t("S5.StrictlyNecessary")}</strong>
          <p>{t("S5.StrictlyNecessaryText")}</p>
        </div>
        <div>
          <strong className="mb-2 block text-[#232323]">{t("S5.Analytics")}</strong>
          <p>{t("S5.AnalyticsText")}</p>
        </div>
        <div>
          <strong className="mb-2 block text-[#232323]">{t("S5.Marketing")}</strong>
          <p>{t("S5.MarketingText")}</p>
        </div>
        <p>{t("S5.Footer")}</p>
      </div>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("S6.Title")}</h2>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("S6.P1")}</p>
      <ul className="mb-6 list-disc space-y-2 pl-6 text-lg leading-relaxed text-[#444]">
        <li>{t("S6.B1.0")}</li>
        <li>{t("S6.B1.1")}</li>
        <li>{t("S6.B1.2")}</li>
        <li>{t("S6.B1.3")}</li>
        <li>{t("S6.B1.4")}</li>
      </ul>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("S6.P2")}</p>
      <p className="mb-6 text-lg leading-relaxed text-[#444]">{t("S6.P3")}</p>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("S7.Title")}</h2>
      <p className="mb-6 text-lg leading-relaxed text-[#444]">{t("S7.P1")}</p>
      <div className="mb-6 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[#444]">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="py-3 px-4 font-semibold text-[#232323]">{t("S7.Table.Headers.0")}</th>
              <th className="py-3 px-4 font-semibold text-[#232323]">{t("S7.Table.Headers.1")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-lg">
            {[0, 1, 2, 3, 4, 5, 6].map((idx) => (
              <tr key={idx} className="transition-colors hover:bg-[#F9FAFB]">
                <td className="py-3 px-4 font-medium">{t(`S7.Table.Rows.${idx}.0`)}</td>
                <td className="py-3 px-4">{t(`S7.Table.Rows.${idx}.1`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mb-6 text-lg leading-relaxed text-[#444]">{t("S7.P2")}</p>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("S8.Title")}</h2>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("S8.P1")}</p>
      <p className="mb-6 text-lg leading-relaxed text-[#444]">{t("S8.P2")}</p>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("S9.Title")}</h2>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("S9.P1")}</p>
      <ul className="mb-6 list-disc space-y-2 pl-6 text-lg leading-relaxed text-[#444]">
        <li>{t("S9.B1.0")}</li>
        <li>{t("S9.B1.1")}</li>
        <li>{t("S9.B1.2")}</li>
        <li>{t("S9.B1.3")}</li>
        <li>{t("S9.B1.4")}</li>
        <li>{t("S9.B1.5")}</li>
        <li>{t("S9.B1.6")}</li>
        <li>{t("S9.B1.7")}</li>
      </ul>
      <p className="mb-6 text-lg leading-relaxed text-[#444]">{t("S9.P2")}</p>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("S10.Title")}</h2>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("S10.P1")}</p>
      <ul className="mb-6 list-disc space-y-2 pl-6 text-lg leading-relaxed text-[#444]">
        <li>{t("S10.B1.0")}</li>
        <li>{t("S10.B1.1")}</li>
        <li>{t("S10.B1.2")}</li>
        <li>{t("S10.B1.3")}</li>
      </ul>
      <p className="mb-6 text-lg leading-relaxed text-[#444]">{t("S10.P2")}</p>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("S11.Title")}</h2>
      <p className="mb-4 text-lg leading-relaxed text-[#444]">{t("S11.P1")}</p>
      <ul className="mb-6 list-disc space-y-2 pl-6 text-lg leading-relaxed text-[#444]">
        <li>{t("S11.B1.0")}</li>
        <li>{t("S11.B1.1")}</li>
        <li>{t("S11.B1.2")}</li>
        <li>{t("S11.B1.3")}</li>
      </ul>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("S12.Title")}</h2>
      <p className="mb-6 text-lg leading-relaxed text-[#444]">{t("S12.P1")}</p>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("S13.Title")}</h2>
      <p className="mb-6 text-lg leading-relaxed text-[#444]">{t("S13.P1")}</p>

      <h2 className="mt-10 mb-4 text-2xl font-semibold text-[#232323]">{t("S14.Title")}</h2>
      <p className="mb-6 text-lg leading-relaxed text-[#444]">{t("S14.P1")}</p>
    </div>
  );
}
