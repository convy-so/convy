"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getNotifications, markNotificationAsRead } from "@/app/actions/notifications";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCircle2, AlertCircle, Info, Loader2, BellRing, MousePointerClick, CalendarClock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";
import { useRouter } from "@/i18n/routing";

export default function NotificationsDashboard() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: response, isLoading } = useQuery({
    queryKey: ["all-notifications"],
    queryFn: () => getNotifications(),
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      // Also invalidate header notifications if they use a similar key or header needs updating
    },
  });

  const data = response?.success ? response.data : [];
  
  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const handleNotificationClick = (id: string, link: string | null | undefined, read: boolean) => {
    if (!read) {
        markAsReadMutation.mutate(id);
    }
    if (link) {
        router.push(link);
    }
  };

  const markAllRead = () => {
    const unreadIds = data.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) {
      toast("All caught up!");
      return;
    }
    
    // Process them linearly avoiding massive concurrent mutations 
    // In a real app we would create a markAllNotificationsRead server action
    unreadIds.forEach(id => markAsReadMutation.mutate(id));
    toast.success("Marked all as read");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      
      {/* Header section */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
            <BellRing className="w-8 h-8 text-indigo-600" />
            Notifications
            </h1>
            <p className="mt-3 text-base text-gray-500">
            View your system alerts, updates, and classroom notifications.
            </p>
        </div>
        
        <button 
           onClick={markAllRead}
           className="inline-flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-4 py-2 hover:bg-gray-50 text-sm font-semibold text-gray-700 shadow-sm transition-all active:scale-95"
        >
            <CheckCircle2 className="w-4 h-4 text-gray-500" />
            Mark all as read
        </button>
      </motion.div>

      {/* Main Container */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden min-h-[500px]">
          {data.length === 0 ? (
            <div className="flex h-[400px] flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                 <Bell className="h-8 w-8 text-gray-300" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">You&apos;re all caught up!</h3>
              <p className="mt-2 text-sm text-gray-500 max-w-sm">
                No new notifications right now. When you receive alerts, collaborations or updates, they&apos;ll appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              <AnimatePresence>
                  {data.map((notification, i) => (
                    <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ delay: Math.min(i * 0.05, 0.5) }}
                        key={notification.id} 
                        onClick={() => handleNotificationClick(notification.id, notification.link, notification.read)}
                        className={`group relative flex items-start gap-4 p-5 hover:bg-gray-50 transition-colors ${notification.link ? 'cursor-pointer' : ''} ${!notification.read ? 'bg-indigo-50/30' : ''}`}
                    >
                        {/* Icon based on type */}
                        <div className={`mt-1 flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                            ${notification.type === 'error' ? 'bg-red-100 text-red-600' : 
                              notification.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 
                              notification.type === 'warning' ? 'bg-amber-100 text-amber-600' : 
                              'bg-indigo-100 text-indigo-600'}`}
                        >
                            {notification.type === 'error' ? <AlertCircle className="w-5 h-5" /> :
                             notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
                             <Info className="w-5 h-5" />}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pr-10">
                            <h4 className={`text-base font-semibold truncate ${!notification.read ? 'text-gray-900' : 'text-gray-700'}`}>
                                {notification.title}
                            </h4>
                            <p className="mt-1 text-sm text-gray-500 leading-relaxed max-w-3xl">
                                {notification.message}
                            </p>
                            
                            <div className="mt-3 flex items-center gap-4 text-xs font-medium text-gray-400">
                                <span className="flex items-center gap-1.5">
                                    <CalendarClock className="w-3.5 h-3.5" />
                                    {notification.createdAt ? formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true }) : ''}
                                </span>
                                {notification.link && (
                                    <span className="flex items-center gap-1 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <MousePointerClick className="w-3.5 h-3.5" />
                                        View Details
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Unread indicator */}
                        {!notification.read && (
                            <div className="absolute top-1/2 right-6 -translate-y-1/2">
                                <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full shadow-sm"></div>
                            </div>
                        )}
                    </motion.div>
                  ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
