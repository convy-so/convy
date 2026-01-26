import { 
  ArrowUpRight, ArrowDownRight, Minus, 
  Users, CheckCircle2, Sparkles, Clock, BarChart3, 
  TrendingUp, MessageSquare, Mic, Calendar, Target,
  LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, LucideIcon> = {
  Users,
  CheckCircle2,
  Sparkles,
  Clock,
  BarChart3,
  TrendingUp,
  MessageSquare,
  Mic,
  Calendar,
  Target
};

interface StatCardProps {
  title: string;
  value: string | number;
  label?: string;
  icon?: string;
  trend?: "up" | "down" | "stable";
  color?: string;
}

export function StatCard({ title, value, label, icon, trend, color = "bg-blue-500" }: StatCardProps) {
  // Safe icon rendering
  const IconComponent = icon ? ICON_MAP[icon] : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-gray-200 transition-all duration-300">
      <div className="flex items-start justify-between mb-3">
        {IconComponent && (
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
            <IconComponent className="w-5 h-5 text-white" />
          </div>
        )}
        
        {trend && (
            <div className={cn(
            "flex items-center gap-1 text-sm font-medium ml-auto",
            trend === "up" && "text-emerald-600",
            trend === "down" && "text-red-600",
            trend === "stable" && "text-gray-500"
            )}>
            {trend === "up" && <ArrowUpRight className="w-4 h-4" />}
            {trend === "down" && <ArrowDownRight className="w-4 h-4" />}
            {trend === "stable" && <Minus className="w-4 h-4" />}
            </div>
        )}
      </div>
      
      <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-sm font-medium text-gray-700">{title}</p>
        {label && <p className="text-xs text-gray-500">{label}</p>}
      </div>
    </div>
  );
}
