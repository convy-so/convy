export default function PrivacyPage() {
    return (
        <div className="max-w-none pb-20">
            <h1 className="text-4xl font-bold mb-4 text-[#232323]">PRIVACY POLICY — CONVY</h1>
            <div className="text-[#666] mb-8 space-y-1">
                <p>Last Updated: March 10, 2026</p>
                <p>Effective Date: March 10, 2026</p>
                <p>Version: 1.0</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">Preamble</h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                Convy ("we", "our", "us") is committed to the protection of your personal data. This Privacy Policy explains how we collect, use, store, and share personal data when you access or use the Convy platform ("Service"), and describes your rights under applicable law.
            </p>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                This Policy applies to:
            </p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li><strong>Customers</strong> — individuals and organizations that create and manage surveys using Convy;</li>
                <li><strong>Respondents</strong> — individuals who participate in surveys created by Customers on the Platform;</li>
                <li><strong>Visitors</strong> — individuals who visit our website without registering.</li>
            </ul>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">1. Identity and Contact Details of the Data Controller</h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                The entity responsible for processing your personal data is:
            </p>
            <div className="bg-[#F9FAFB] p-6 rounded-xl border border-gray-100 text-[#444] leading-relaxed text-lg mb-6">
                <p>Convy</p>
                <p>[Registered Company Name and Legal Form]</p>
                <p>[Registered Address]</p>
                <p>[City, Postal Code, Germany]</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">2. What Personal Data We Collect</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                We collect personal data in two ways: directly from you, and automatically through your use of the Platform.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3 text-[#232323]">2.1 From Customers (Account Holders)</h3>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li>Full name and professional title</li>
                <li>Business email address</li>
                <li>Organization name</li>
                <li>Billing name, billing address, and payment identifiers (processed via third-party payment processors; we do not store full card details)</li>
                <li>Account credentials (stored in hashed and encrypted form)</li>
                <li>Usage data: features accessed, survey templates created, and session logs</li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3 text-[#232323]">2.2 From Respondents (Survey Participants)</h3>
            <ul className="list-disc pl-6 mb-4 text-[#444] leading-relaxed text-lg space-y-2">
                <li>Conversational survey responses as submitted</li>
                <li>Metadata required for survey integrity: response timestamps and session identifiers</li>
                <li>Survey de-duplication cookie data (see Section 5)</li>
                <li>IP address, used solely for geographic approximation and fraud prevention, and not linked to response content</li>
                <li>Device and browser type, collected for technical purposes</li>
            </ul>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                Respondents are actively notified at the point of survey entry that their responses will be processed by Convy on behalf of the Customer, and that the conversational experience is powered by an AI system.
            </p>

            <h3 className="text-xl font-medium mt-6 mb-3 text-[#232323]">2.3 From Website Visitors</h3>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li>IP address and browser information collected via server logs</li>
                <li>Cookie and analytics data, subject to consent (see Section 5)</li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3 text-[#232323]">2.4 Data We Do Not Collect</h3>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                Convy does not intentionally collect:
            </p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li><strong>Sensitive personal data</strong> — including health data, biometric data, racial or ethnic origin, religious beliefs, political opinions, or sexual orientation — unless you as a Customer explicitly configure a survey to collect such data, in which case you are solely responsible for the appropriate legal basis and safeguards.</li>
                <li>Data from individuals under 18 years of age. If you believe a minor has submitted data through the Platform, please contact us directly.</li>
            </ul>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">3. How and Why We Use Your Personal Data</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                All processing activities are grounded in a specific lawful basis. The table below outlines each purpose.
            </p>
            <div className="overflow-x-auto mb-6">
                <table className="w-full text-left border-collapse text-[#444]">
                    <thead>
                        <tr className="border-b-2 border-gray-200">
                            <th className="py-3 px-4 font-semibold text-[#232323]">Purpose</th>
                            <th className="py-3 px-4 font-semibold text-[#232323]">Data Involved</th>
                            <th className="py-3 px-4 font-semibold text-[#232323]">Legal Basis</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-lg">
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">Providing and operating the Service</td>
                            <td className="py-3 px-4">Account data, usage data</td>
                            <td className="py-3 px-4">Contractual necessity</td>
                        </tr>
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">Billing and invoicing</td>
                            <td className="py-3 px-4">Billing name, address, payment identifiers</td>
                            <td className="py-3 px-4">Contractual necessity</td>
                        </tr>
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">Delivering survey functionality to Respondents</td>
                            <td className="py-3 px-4">Survey responses, session metadata</td>
                            <td className="py-3 px-4">Legitimate interest of the Customer (Customer acting as Controller)</td>
                        </tr>
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">Survey de-duplication and integrity</td>
                            <td className="py-3 px-4">De-duplication cookie, session token</td>
                            <td className="py-3 px-4">Legitimate interest — prevention of fraudulent or duplicate responses</td>
                        </tr>
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">AI model improvement via Interaction Patterns</td>
                            <td className="py-3 px-4">Anonymized, aggregated structural signals only — never raw responses or identifiable data</td>
                            <td className="py-3 px-4">Legitimate interest — platform development (see Section 4)</td>
                        </tr>
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">Security monitoring and fraud prevention</td>
                            <td className="py-3 px-4">IP address, device data, access logs</td>
                            <td className="py-3 px-4">Legitimate interest</td>
                        </tr>
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">Legal compliance</td>
                            <td className="py-3 px-4">Any data required by applicable law</td>
                            <td className="py-3 px-4">Legal obligation</td>
                        </tr>
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">Marketing and product communications</td>
                            <td className="py-3 px-4">Email address</td>
                            <td className="py-3 px-4">Consent (opt-in only)</td>
                        </tr>
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">Analytics and platform performance</td>
                            <td className="py-3 px-4">Cookie and usage data</td>
                            <td className="py-3 px-4">Consent</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">4. AI Model Improvement — Our Strict Commitment</h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                This section is important and we want to be fully transparent about it.
            </p>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                <strong>What we extract.</strong> To improve the quality of our AI survey assistant, we analyze Interaction Patterns — structural, anonymized, and aggregated signals that help us understand:
            </p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li>Which conversational flows lead to complete, high-quality survey engagements;</li>
                <li>Which question-phrasing approaches work best in specific domains (e.g., customer experience, HR, civic research);</li>
                <li>How our NLP and clustering models can be made more accurate and domain-appropriate.</li>
            </ul>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                <strong>What we never extract or use for training:</strong>
            </p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li>The substantive content of your surveys — your questions and your respondents' answers;</li>
                <li>Any information about your company's strategy, products, competitive positioning, or operations;</li>
                <li>Any personally identifiable information about you or your respondents;</li>
                <li>Any data that could identify your organization or be attributed to it.</li>
            </ul>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                <strong>The principle.</strong> Our AI learns how good conversations are structured — not what your conversations contain. The service delivery pipeline and the model improvement pipeline are architecturally separated. Raw Customer Data does not enter the model training pipeline.
            </p>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                You may object to this processing at any time by contacting us directly (see Section 9).
            </p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">5. Cookies and Tracking Technologies</h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                We use the following categories of cookies:
            </p>
            <div className="space-y-6 mb-6 text-[#444] leading-relaxed text-lg">
                <div>
                    <strong className="text-[#232323] block mb-2">Strictly Necessary Cookies (No consent required)</strong>
                    <p>These cookies are essential for the Platform to function. They include session management cookies, authentication tokens, and the survey de-duplication cookie — deployed specifically to prevent a Respondent from completing the same survey more than once. Respondents are informed of this cookie when they access a survey. This cookie contains no personal content, does not track behavior across sites, and expires upon survey completion or session end.</p>
                </div>
                <div>
                    <strong className="text-[#232323] block mb-2">Analytics and Performance Cookies (Require consent)</strong>
                    <p>We use analytics tools to understand how the Platform is used. These cookies are only set after you provide active, informed consent via our cookie consent banner. You may withdraw consent at any time.</p>
                </div>
                <div>
                    <strong className="text-[#232323] block mb-2">Marketing Cookies (Require consent)</strong>
                    <p>Where applicable, marketing cookies help us understand the effectiveness of our outreach. These are only activated upon explicit consent.</p>
                </div>
                <p>You can manage your cookie preferences at any time via our Cookie Preference Center or by adjusting your browser settings.</p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">6. Data Sharing and Third-Party Processors</h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                We do not sell your personal data. We do not share Customer Data with third parties for their own commercial purposes. We share limited data with trusted third-party data processors — entities that act strictly on our instruction — including:
            </p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li>Cloud infrastructure providers for platform hosting and storage;</li>
                <li>Payment processors for billing, who handle payment card data under their own security-compliant frameworks;</li>
                <li>Analytics providers, subject to your consent, for platform performance monitoring;</li>
                <li>Email delivery providers for transactional and product communications;</li>
                <li>AI infrastructure providers, where applicable, strictly limited to processing anonymized Interaction Patterns.</li>
            </ul>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                All processors are bound by data processing agreements. Where processors are located outside of the jurisdiction in which your data originates, appropriate transfer safeguards are in place (see Section 8).
            </p>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                We may also disclose data where required by law, court order, or competent authority. Where legally permitted, we will notify you before doing so.
            </p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">7. Data Retention</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                We retain personal data only for as long as necessary for the stated purpose or as required by applicable law.
            </p>
            <div className="overflow-x-auto mb-6">
                <table className="w-full text-left border-collapse text-[#444]">
                    <thead>
                        <tr className="border-b-2 border-gray-200">
                            <th className="py-3 px-4 font-semibold text-[#232323]">Data Category</th>
                            <th className="py-3 px-4 font-semibold text-[#232323]">Retention Period</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-lg">
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">Customer account data</td>
                            <td className="py-3 px-4">Duration of the contract + 3 years</td>
                        </tr>
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">Survey responses (Customer Data)</td>
                            <td className="py-3 px-4">Duration of contract, or until Customer requests deletion</td>
                        </tr>
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">Billing and invoicing records</td>
                            <td className="py-3 px-4">10 years, as required by applicable financial and tax law</td>
                        </tr>
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">Server logs and IP address data</td>
                            <td className="py-3 px-4">30 days, then automatically deleted</td>
                        </tr>
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">Analytics data (if consented)</td>
                            <td className="py-3 px-4">14 months, then aggregated and anonymized</td>
                        </tr>
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">De-duplication cookies</td>
                            <td className="py-3 px-4">Session duration or until survey completion</td>
                        </tr>
                        <tr className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="py-3 px-4 font-medium">Anonymized Interaction Patterns</td>
                            <td className="py-3 px-4">Indefinitely, as these no longer constitute personal data once anonymized</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                Upon account termination, Customer Data is deleted or returned upon request within 30 days, subject to any statutory retention obligations.
            </p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">8. International Data Transfers</h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                Convy is registered and primarily operates in Germany. If we transfer personal data to processors or infrastructure located in other countries, we ensure that appropriate safeguards are in place — including contractual protections, adequacy mechanisms, or other recognized legal frameworks applicable in the relevant jurisdiction.
            </p>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                You may request information about the specific safeguards applicable to your data by contacting us directly.
            </p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">9. Your Rights</h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                Depending on your jurisdiction, you may have the right to:
            </p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li><strong>Access</strong> — request a copy of the personal data we hold about you;</li>
                <li><strong>Rectification</strong> — request correction of inaccurate or incomplete data;</li>
                <li><strong>Erasure</strong> — request deletion of your data where it is no longer necessary, or where processing is unlawful;</li>
                <li><strong>Restriction</strong> — request that we limit how we process your data in certain circumstances;</li>
                <li><strong>Portability</strong> — receive your data in a structured, commonly used, machine-readable format;</li>
                <li><strong>Object</strong> — object to processing carried out on the basis of legitimate interest, including the use of Interaction Patterns for AI improvement. Upon a valid objection, we will cease that processing unless we can demonstrate compelling grounds that override your interests;</li>
                <li><strong>Withdraw Consent</strong> — where processing is based on consent, you may withdraw it at any time without affecting the lawfulness of prior processing;</li>
                <li><strong>Non-Automated Decision-Making</strong> — the right not to be subject to decisions based solely on automated processing that produce significant legal effects. Convy does not make such decisions about you.</li>
            </ul>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                To exercise any of these rights, contact us directly. We will respond within 30 days. In complex cases, we may extend this period by an additional 60 days with prior notice.
            </p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">10. Data Security</h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                We implement appropriate technical and organizational measures to protect personal data against unauthorized access, accidental loss, destruction, or disclosure, including:
            </p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li>Encryption of data in transit (TLS 1.2+) and at rest (AES-256);</li>
                <li>Role-based access controls and least-privilege principles;</li>
                <li>Regular security assessments and vulnerability testing;</li>
                <li>Incident response procedures and breach notification processes.</li>
            </ul>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                In the event of a personal data breach likely to result in a risk to individuals' rights and freedoms, we will notify the relevant supervisory authority and affected individuals in accordance with applicable law and without undue delay.
            </p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">11. Respondent-Specific Provisions</h2>
            <p className="mb-4 text-[#444] leading-relaxed text-lg">
                Respondents accessing surveys hosted on the Convy Platform should be aware that:
            </p>
            <ul className="list-disc pl-6 mb-6 text-[#444] leading-relaxed text-lg space-y-2">
                <li>The survey is created and operated by the Customer — the organization that sent you the survey link. For questions about how your responses will be used, please contact that organization directly.</li>
                <li>Convy acts as a data processor on behalf of the Customer for your survey responses.</li>
                <li>You are interacting with an AI-powered conversational system. This is disclosed to you at the point of entry into every survey.</li>
                <li>A de-duplication cookie will be stored on your device to prevent multiple submissions to the same survey. You are notified of this upon entering the survey. This cookie is technically necessary for survey integrity.</li>
            </ul>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">12. Children's Privacy</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                The Service is not directed at individuals under the age of 18. We do not knowingly collect personal data from minors. If we become aware that we have inadvertently collected such data, we will delete it promptly. If you believe a minor has provided us with personal data, please contact us directly.
            </p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">13. Updates to This Privacy Policy</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                We may update this Privacy Policy from time to time. If we make material changes — for example, to the purposes for which we process your data or to the rights available to you — we will notify you by email and/or by a prominent notice on the Platform at least 14 days before the changes take effect. The "Last Updated" date at the top of this Policy reflects the most recent revision. Your continued use of the Service after the effective date of any update constitutes your acceptance of the revised Policy.
            </p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">14. Right to Lodge a Complaint</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                If you believe that our processing of your personal data violates applicable law, you have the right to lodge a complaint with the relevant data protection supervisory authority in your country or region of residence.
            </p>
        </div>
    );
}
