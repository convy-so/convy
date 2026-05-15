import { Bell, ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/routing";

export default function StudentNotificationsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/student/dashboard"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Back to dashboard
      </Link>
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
          <Bell className="h-6 w-6 text-gray-600" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          New messages for you appear when you tap the{" "}
          <span className="font-medium text-gray-900">bell</span> in the top bar. You can read them there and mark them
          as read. A full inbox page will be added here later.
        </p>
      </div>
    </div>
  );
}
