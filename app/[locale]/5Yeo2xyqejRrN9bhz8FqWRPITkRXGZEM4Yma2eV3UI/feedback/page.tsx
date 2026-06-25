import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  getPlatformFeedbackItems,
  updatePlatformFeedbackStatus,
} from "@/app/actions/admin";
import { getLocalizedAdminAppPath } from "@/features/auth/public-server";
import { normalizeAppLocale } from "@/shared/i18n/config";

type FeedbackStatus = "open" | "reviewing" | "resolved" | "dismissed";

const statusClasses: Record<FeedbackStatus, string> = {
  open: "bg-rose-50 text-rose-700",
  reviewing: "bg-amber-50 text-amber-700",
  resolved: "bg-emerald-50 text-emerald-700",
  dismissed: "bg-slate-100 text-slate-600",
};

function isFeedbackStatus(value: string): value is FeedbackStatus {
  return (
    value === "open" ||
    value === "reviewing" ||
    value === "resolved" ||
    value === "dismissed"
  );
}

function getFormDataString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export default async function AdminFeedbackPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const appLocale = normalizeAppLocale(locale);
  const cookieHeader = (await headers()).get("cookie");
  const result = await getPlatformFeedbackItems(cookieHeader);
  const items = result.success ? result.data : [];

  async function setFeedbackStatus(formData: FormData) {
    "use server";

    const feedbackId = getFormDataString(formData, "feedbackId");
    const rawStatus = getFormDataString(formData, "status");

    if (!feedbackId || !isFeedbackStatus(rawStatus)) {
      return;
    }

    const result = await updatePlatformFeedbackStatus(
      feedbackId,
      rawStatus,
    );
    if (result.success) {
      revalidatePath(getLocalizedAdminAppPath(appLocale, "/feedback"));
    } else {
      console.error("[AdminFeedback] setFeedbackStatus failed:", result.error);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Complaints and Suggestions
        </h1>
        <p className="text-gray-500">
          Review feedback submitted by teachers, students, and experts.
        </p>
      </div>

      <div className="grid gap-4">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
            No complaints or suggestions have been submitted yet.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="rounded-[1.75rem] border border-gray-100 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    <span>{item.kind}</span>
                    <span>â€¢</span>
                    <span>{item.submitterRole}</span>
                    <span>â€¢</span>
                    <span>{item.sourceArea}</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-950">
                      {item.subject}
                    </h2>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
                      {item.message}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                    <span>
                      Contact:{" "}
                      {item.contactEmail ||
                        item.userEmail ||
                        item.classroomStudentEmail ||
                        "Not provided"}
                    </span>
                    <span>
                      By:{" "}
                      {item.userName ||
                        item.classroomStudentName ||
                        item.userEmail ||
                        "Unknown"}
                    </span>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                <div className="space-y-3 sm:w-56">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                      isFeedbackStatus(item.status)
                        ? statusClasses[item.status]
                        : statusClasses.open
                    }`}
                  >
                    {item.status}
                  </span>

                  <form action={setFeedbackStatus} className="space-y-2">
                    <input name="feedbackId" type="hidden" value={item.id} />
                    <select
                      className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                      defaultValue={item.status}
                      name="status"
                    >
                      <option value="open">Open</option>
                      <option value="reviewing">Reviewing</option>
                      <option value="resolved">Resolved</option>
                      <option value="dismissed">Dismissed</option>
                    </select>
                    <button
                      className="w-full rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
                      type="submit"
                    >
                      Update status
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
