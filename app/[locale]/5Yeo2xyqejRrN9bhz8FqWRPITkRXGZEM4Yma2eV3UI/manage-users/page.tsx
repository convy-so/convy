import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import {
  ShieldAlert,
  Shield,
  UserCheck,
  UserCog,
  UserCog2,
} from "lucide-react";

import { getDb } from "@/db";
import { expertInvitations, users } from "@/db/schema";
import { Link } from "@/i18n/routing";
import { getAdminAppPath } from "@/lib/auth/admin-path";
import { normalizeExpertDisplayName } from "@/lib/auth/expert-profile";
import { isExpertInvitationExpired } from "@/lib/auth/expert-invitations";
import { ResendExpertInviteButton } from "@/components/admin/resend-expert-invite-button";

export default async function AdminUsersPage() {
  await headers();

  const [allUsers, pendingInvites] = await Promise.all([
    getDb().select().from(users).orderBy(desc(users.createdAt)),
    getDb()
      .select()
      .from(expertInvitations)
      .where(eq(expertInvitations.status, "pending"))
      .orderBy(desc(expertInvitations.createdAt)),
  ]);

  const pendingInviteByUserId = new Map(
    pendingInvites.map((invite) => [invite.invitedUserId, invite]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="mt-1 text-slate-500">
            View and manage all platform users.
          </p>
        </div>
        <Link
          href={getAdminAppPath("/manage-users/create-expert")}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <UserCog2 className="h-4 w-4" />
          Provision Expert
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allUsers.map((user) => {
              const displayName = normalizeExpertDisplayName(user.name);
              const avatarLabel = (displayName ?? user.email).charAt(0).toUpperCase();

              return (
              <tr
                key={user.id}
                className="transition-colors hover:bg-slate-50/50"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-600">
                      {avatarLabel}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        {displayName ?? "Name pending"}
                      </p>
                      <p className="text-sm text-slate-500">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                      user.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : user.role === "expert"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {user.role === "admin" && <Shield className="h-3.5 w-3.5" />}
                    {user.role === "expert" && <UserCog className="h-3.5 w-3.5" />}
                    {(user.role === "student" || user.role === "teacher") && (
                      <UserCheck className="h-3.5 w-3.5" />
                    )}
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {user.banned ? (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600">
                      <ShieldAlert className="h-4 w-4" /> Banned
                    </span>
                  ) : user.role === "expert" && pendingInviteByUserId.has(user.id) ? (
                    (() => {
                      const invite = pendingInviteByUserId.get(user.id)!;
                      const expired = isExpertInvitationExpired(invite);

                      return (
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-sm font-medium ${
                              expired ? "text-amber-600" : "text-sky-600"
                            }`}
                          >
                            {expired ? "Invite expired" : "Invite pending"}
                          </span>
                          <ResendExpertInviteButton invitationId={invite.id} />
                        </div>
                      );
                    })()
                  ) : (
                    <span className="text-sm font-medium text-emerald-600">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right text-sm text-slate-500">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
