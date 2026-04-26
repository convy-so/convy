import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string;
  description?: string;
  trend?: "up" | "down" | "neutral";
}

export function StatsCard({
  title,
  value,
  description,
  trend,
}: StatsCardProps) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          {title}
        </h4>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-gray-900">{value}</span>
          {trend && (
            <span
              className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-full",
                trend === "up"
                  ? "bg-emerald-50 text-emerald-600"
                  : trend === "down"
                    ? "bg-red-50 text-red-600"
                    : "bg-gray-50 text-gray-600",
              )}
            >
              {trend === "up" ? "↑" : trend === "down" ? "↓" : "•"}
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        )}
      </div>
    </div>
  );
}
