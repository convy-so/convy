"use client";

import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { getActiveWorkspace } from "@/app/actions/workspace";
import { useEffect, useState } from "react";


export default function ProfilePage() {
    const { user, session } = useAuth();
    const [workspace, setWorkspace] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            const wsRes = await getActiveWorkspace();

            if (wsRes.success && wsRes.data) setWorkspace(wsRes.data);
            setIsLoading(false);
        }
        loadData();
    }, []);


    if (!user) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold text-gray-900">My Profile</h1>
            </div>

            {/* Profile Header Card */}
            <div className="bg-white rounded-3xl border border-gray-100 p-8 flex flex-col md:flex-row items-center md:items-start gap-8">
                <div className="relative group">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-gray-50 bg-gray-50 flex items-center justify-center">
                        {user.image ? (
                            <img src={user.image} alt={user.name ?? ""} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-indigo-600 flex items-center justify-center text-white text-3xl font-medium uppercase">
                                {user.name?.charAt(0)}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 text-center md:text-left space-y-1">
                    <h2 className="text-2xl font-semibold text-gray-900">{user.name}</h2>
                    <p className="text-sm font-medium text-gray-500">{workspace?.role || 'Member'}</p>
                </div>

                <div className="flex gap-3">
                    <Link
                        href="/dashboard/settings"
                        className="px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all font-sans"
                    >
                        Edit Profile
                    </Link>
                </div>
            </div>

            {/* Personal Information */}
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
                <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
                   
                </div>

                <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-8 gap-x-12">
                    <div>
                        <label className="text-[10px] font-medium text-gray-400 uppercase tracking-widest block mb-1">First Name</label>
                        <p className="text-gray-900 font-medium">{user.name?.split(' ')[0] || '-'}</p>
                    </div>
                    <div>
                        <label className="text-[10px] font-medium text-gray-400 uppercase tracking-widest block mb-1">Last Name</label>
                        <p className="text-gray-900 font-medium">{user.name?.split(' ').slice(1).join(' ') || '-'}</p>
                    </div>
                    <div>
                        <label className="text-[10px] font-medium text-gray-400 uppercase tracking-widest block mb-1">Email Address</label>
                        <p className="text-gray-900 font-medium">{user.email}</p>
                    </div>
                    <div>
                        <label className="text-[10px] font-medium text-gray-400 uppercase tracking-widest block mb-1">Join Date</label>
                        <p className="text-gray-900 font-medium">{new Date(user.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                        <label className="text-[10px] font-medium text-gray-400 uppercase tracking-widest block mb-1">User Role</label>
                        <p className="text-gray-900 font-medium capitalize">{workspace?.role || 'Member'}</p>
                    </div>
                    
                </div>
            </div>
        </div>
    );
}


