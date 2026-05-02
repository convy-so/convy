import { headers } from "next/headers";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { desc } from "drizzle-orm";
import { ShieldAlert, UserCog, UserCheck, Shield, UserCog2 } from "lucide-react";
import { Link } from "@/i18n/routing";

export default async function AdminUsersPage() {
    // Force dynamic rendering to support database access and resolve prerender errors
    await headers();
    
    const allUsers = await getDb()
        .select()
        .from(users)
        .orderBy(desc(users.createdAt));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
                    <p className="text-slate-500 mt-1">View and manage all platform users.</p>
                </div>
                <Link
                    href="/5Yeo2xyqejRrN9bhz8FqWRPITkRXGZEM4Yma2eV3UI/manage-users/create-expert"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                    <UserCog2 className="w-4 h-4" />
                    Provision Expert
                </Link>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                            <th className="px-6 py-4">User</th>
                            <th className="px-6 py-4">Role</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Joined</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {allUsers.map((user) => (
                            <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">
                                            {user.name?.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-900">{user.name}</p>
                                            <p className="text-sm text-slate-500">{user.email}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                                        user.role === 'admin' 
                                            ? 'bg-purple-100 text-purple-700'
                                            : user.role === 'expert'
                                                ? 'bg-amber-100 text-amber-700'
                                                : 'bg-blue-100 text-blue-700'
                                    }`}>
                                        {user.role === 'admin' && <Shield className="w-3.5 h-3.5" />}
                                        {user.role === 'expert' && <UserCog className="w-3.5 h-3.5" />}
                                        {user.role === 'user' && <UserCheck className="w-3.5 h-3.5" />}
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    {user.banned ? (
                                        <span className="inline-flex items-center gap-1 text-sm text-red-600 font-medium">
                                            <ShieldAlert className="w-4 h-4" /> Banned
                                        </span>
                                    ) : (
                                        <span className="text-sm text-emerald-600 font-medium">Active</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right text-sm text-slate-500">
                                    {new Date(user.createdAt).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
