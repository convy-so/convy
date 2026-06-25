import type { ReactNode } from "react";

export function LiveSessionStatusCard({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-400 ring-1 ring-slate-100">
        {icon}
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="max-w-xs text-sm text-slate-500">{message}</p>
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
