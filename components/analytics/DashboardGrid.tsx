"use client";

import { DashboardWidget } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {  
  PieChart, Pie, Tooltip, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Sector, Rectangle
} from "recharts";
import { 
  Users, CheckCircle, Star, Target, 
  ArrowUp, ArrowDown, Minus, Quote, PlayCircle
} from "lucide-react";
import { SentimentGauge } from "./SentimentGauge";

interface DashboardGridProps {
  widgets: DashboardWidget[];
  className?: string;
}

const COLORS = [
  "#111827", "#9CA3AF", "#4b5563", "#10b981", 
  "#f59e0b", "#6366f1", "#ec4899"
];

export function DashboardGrid({ widgets, className }: DashboardGridProps) {
  // Sort widgets by priority if needed, though usually backend handles this
  const sortedWidgets = [...widgets].sort((a, b) => (a.priority || 0) - (b.priority || 0));

  return (
    <div className={cn(
      "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-[minmax(180px,auto)]",
      className
    )}>
      {sortedWidgets.map((widget) => (
        <WidgetCard key={widget.id} widget={widget} />
      ))}
    </div>
  );
}

function WidgetCard({ widget }: { widget: DashboardWidget }) {
  // Determine grid span based on size
  const spanClasses = {
    small: "col-span-1 row-span-1",
    medium: "col-span-1 md:col-span-2 lg:col-span-2 row-span-1", // 2x1
    large: "col-span-1 md:col-span-2 lg:col-span-2 row-span-2", // 2x2
    full: "col-span-1 md:col-span-2 lg:col-span-4", // Full width
  };

  return (
    <div className={cn(
      "bg-white rounded-[2rem] p-6 border border-gray-100/50 flex flex-col transition-all duration-300",
      spanClasses[widget.size as keyof typeof spanClasses] ?? spanClasses.small
    )}>
      <div className="mb-4 flex justify-between items-start">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 tracking-tight">{widget.title}</h3>
          {widget.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-1">{widget.description}</p>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <WidgetContent widget={widget} />
      </div>
    </div>
  );
}

function WidgetContent({ widget }: { widget: DashboardWidget }) {
  const data = widget.data as any;

  switch (widget.type) {
    case "stat_card":
      return <StatCardContent data={data} />;
    case "pie_chart":
      return <PieChartContent data={data} />;
    case "bar_chart":
    case "histogram":
      return <BarChartContent data={data} />;
    case "metric_breakdown":
    case "text":
    case "wordcloud": // Fallback for now
      return <ListContent data={data} />;
    case "quote_carousel":
      return <QuoteListContent data={data} />;
    case "hypothesis_card":
      return <HypothesisContent data={data} />;
    case "recommendation_card":
       return <RecommendationContent data={data} />;
    case "media_effectiveness":
       return <MediaEffectivenessContent data={data} />;
    case "sentiment_gauge":
       // SentimentGauge usually expects specific props, adapting here
      return (
         <div className="h-full flex items-center justify-center">
            <SentimentGauge 
              score={data.score} 
              confidence={data.confidence} 
              overall={data.overall} 
              compact={true}
            />
         </div>
      );
    default:
      return (
        <div className="flex items-center justify-center h-full text-xs text-gray-300">
          Widget type {widget.type} not supported
        </div>
      );
  }
}

// --- Specific Content Components ---

function StatCardContent({ data }: { data: any }) {
  const Icon = getIcon(data.icon);
  
  return (
    <div className="flex flex-col justify-between h-full py-2">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-gray-900 tracking-tighter">
          {data.value}
        </span>
      </div>
      
      <div className="flex items-center justify-between">
         <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          {data.label}
        </span>
        {data.trend && (
          <div className={cn(
            "flex items-center px-2 py-1 rounded-full text-[10px] font-bold",
            data.trend === "up" ? "bg-green-50 text-green-600" :
            data.trend === "down" ? "bg-red-50 text-red-600" :
            "bg-gray-50 text-gray-500"
          )}>
            {data.trend === "up" && <ArrowUp className="w-3 h-3 mr-1" />}
            {data.trend === "down" && <ArrowDown className="w-3 h-3 mr-1" />}
            {data.trend === "stable" && <Minus className="w-3 h-3 mr-1" />}
            {data.trendValue || "Stable"}
          </div>
        )}
      </div>
      
       {/* Absolute positioned icon for visual flair */}
       {Icon && (
         <div className="absolute top-0 right-0 p-2 opacity-5">
           <Icon className="w-16 h-16 text-black" />
         </div>
       )}
    </div>
  );
}

function PieChartContent({ data }: { data: any }) {
  if (!data?.segments?.length) return <EmptyState />;
  
  return (
    <div className="w-full h-full flex flex-col md:flex-row items-center gap-4">
      <div className="w-32 h-32 md:w-36 md:h-36 flex-shrink-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data.segments}
              innerRadius={40}
              outerRadius={60}
              paddingAngle={4}
              dataKey="value"
              stroke="none"
              cornerRadius={4}
              shape={(props: any) => {
                const { index, payload } = props;
                return (
                  <Sector 
                    {...props} 
                    fill={payload.color || COLORS[index % COLORS.length]} 
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label if needed */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
           <span className="text-xs font-bold text-gray-300">
             {data.total ? data.total : ""}
           </span>
        </div>
      </div>
      
      <div className="flex flex-col justify-center gap-2 flex-grow min-w-0 w-full">
        {data.segments.slice(0, 4).map((entry: any, i: number) => (
          <div key={i} className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2 min-w-0">
               <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color || COLORS[i % COLORS.length] }} />
               <span className="text-xs text-gray-500 truncate" title={entry.label}>{entry.label}</span>
            </div>
            <span className="text-xs font-semibold text-gray-900 ml-2">{entry.value}</span>
          </div>
        ))}
        {data.segments.length > 4 && (
          <span className="text-[10px] text-gray-400 pl-4">+ {data.segments.length - 4} more</span>
        )}
      </div>
    </div>
  );
}

function BarChartContent({ data }: { data: any[] }) {
    // Adapter for legacy format or new format
    const chartData = Array.isArray(data) ? data : (data as any).bars || [];
    
    if (!chartData.length) return <EmptyState />;

    return (
        <div className="w-full h-full min-h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis 
                        dataKey="label" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false} 
                        stroke="#9ca3af"
                        interval={0}
                        // truncate long labels
                        tickFormatter={(v) => v.length > 10 ? `${v.slice(0, 10)}...` : v}
                    />
                    <YAxis 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false} 
                        stroke="#9ca3af" 
                    />
                    <Tooltip 
                        cursor={{ fill: '#f9fafb' }}
                        contentStyle={{ borderRadius: '12px', border: 'none' }}
                        itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                    />
                    <Bar 
                        dataKey="value" 
                        barSize={32}
                        shape={(props: any) => {
                            const { payload } = props;
                            return (
                                <Rectangle 
                                    {...props} 
                                    fill={payload.color || "#111827"} 
                                    radius={[4, 4, 0, 0]} 
                                />
                            );
                        }}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}

function ListContent({ data }: { data: any[] }) {
    if (!data?.length) return <EmptyState />;
    // Assuming data is array of { value, count, percentage } or similar
    // We sort and take top 5
    const limit = 5;
    const sorted = [...data].sort((a,b) => (b.count || b.value) - (a.count || a.value));
    const maxVal = sorted[0]?.count || sorted[0]?.value || 1;
    
    return (
        <div className="space-y-3 pt-2">
            {sorted.slice(0, limit).map((item, i) => (
                <div key={i} className="group">
                    <div className="flex justify-between items-center mb-1 text-xs">
                        <span className="font-medium text-gray-700 truncate max-w-[70%]">
                             {/* Handle both string/number values */}
                             {typeof item.value === 'boolean' ? (item.value ? 'Yes' : 'No') : item.value}
                        </span>
                        <span className="text-gray-400">
                            {item.percentage ? `${Math.round(item.percentage)}%` : item.count}
                        </span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-50 rounded-full overflow-hidden">
                         <div 
                            className="h-full rounded-full bg-gray-900 group-hover:bg-black transition-all duration-500"
                            style={{ 
                                width: `${((item.count || item.value) / maxVal) * 100}%`,
                                backgroundColor: COLORS[i % COLORS.length]
                            }}
                         />
                    </div>
                </div>
            ))}
            {data.length > limit && (
                <div className="text-[10px] text-center text-gray-400 pt-1">
                    + {data.length - limit} more
                </div>
            )}
        </div>
    )
}

function InsightListContent({ data }: { data: any }) {
    const insights = data.insights || [];
    if (!insights.length) return <EmptyState />;
    
    return (
        <div className="space-y-3 h-full overflow-y-auto custom-scrollbar pr-2">
            {insights.map((insight: any, i: number) => (
                <div key={i} className="flex gap-3 items-start p-3 bg-gray-50/50 rounded-xl hover:bg-gray-50 transition-colors">
                     <span className={cn(
                        "w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0",
                        insight.significance === 'high' ? "bg-black" : 
                        insight.significance === 'medium' ? "bg-gray-400" : "bg-gray-200"
                     )} />
                     <p className="text-sm text-gray-600 leading-relaxed">
                        {insight.text}
                     </p>
                </div>
            ))}
        </div>
    )
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center text-gray-300 h-full min-h-[100px]">
            <Target className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-xs">No data available</p>
        </div>
    )
}

// Helper to map icon strings to Lucide components
function getIcon(name?: string) {
    if (!name) return null;
    const map: Record<string, any> = {
        users: Users,
        "check-circle": CheckCircle,
        star: Star,
        target: Target,
        image: Users, // Fallback
        "play-circle": PlayCircle,
    };
    return map[name] || null;
}

function QuoteListContent({ data }: { data: any }) {
    const quotes = data.quotes || [];
    if (!quotes.length) return <EmptyState />;
    
    return (
        <div className="space-y-4 h-full overflow-y-auto custom-scrollbar p-1">
            {quotes.slice(0, 3).map((q: any, i: number) => (
                <div key={i} className="relative pl-6 italic text-sm text-gray-600">
                    <Quote className="absolute left-0 top-0 w-4 h-4 text-gray-300" />
                    <p>"{q.text}"</p>
                </div>
            ))}
        </div>
    )
}

function HypothesisContent({ data }: { data: any }) {
    return (
        <div className="flex flex-col h-full justify-between">
            <div>
                 <p className="text-sm font-medium text-gray-900 mb-2">{data.hypothesis}</p>
                 <div className={cn(
                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                    data.status === 'validated' ? "bg-green-100 text-green-800" :
                    data.status === 'refuted' ? "bg-red-100 text-red-800" :
                    "bg-yellow-100 text-yellow-800"
                 )}>
                    {data.status}
                 </div>
            </div>
            <p className="text-xs text-gray-500 mt-4 line-clamp-3">{data.summary}</p>
        </div>
    )
}

function RecommendationContent({ data }: { data: any[] }) {
    if(!data?.length) return <EmptyState />;
    
    return (
        <div className="space-y-3 h-full overflow-y-auto custom-scrollbar">
             {data.slice(0, 4).map((rec: any, i: number) => (
                <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className={cn(
                        "w-1 h-full rounded-full flex-shrink-0 bg-gray-300",
                        rec.priority === 'high' && "bg-black",
                        rec.priority === 'medium' && "bg-gray-500"
                    )} />
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900">{rec.title}</h4>
                        <p className="text-xs text-gray-500 mt-1">{rec.description}</p>
                    </div>
                </div>
             ))}
        </div>
    )
}

function MediaEffectivenessContent({ data }: { data: any[] }) {
    if(!data?.length) return <EmptyState />;
    
    return (
        <div className="space-y-2">
            {data.slice(0, 5).map((media: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[60%] text-gray-600">{media.description}</span>
                    <div className="flex items-center gap-2">
                        <span className="font-medium">{Math.round(media.effectivenessScore * 10)}/10</span>
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gray-800" 
                                style={{ width: `${media.usageRate}%` }} 
                            />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}
