"use client";
import React from "react";

import { DashboardWidget } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
  PieChart, Pie, ResponsiveContainer,
  Sector
} from "recharts";
import {
  Users, CheckCircle, Star, Target,
  ArrowUp, ArrowDown, Minus, Quote, PlayCircle,
  Lightbulb, Car, MapPin, BarChart2, Laptop, Cloud,
  Smile, Frown, Phone, Activity, ShoppingCart,
  Clock, DollarSign, Calendar, MessageCircle,
  Home, Briefcase, Zap, Globe, Shield, HelpCircle
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
    medium: "col-span-1 md:col-span-2 lg:col-span-2 row-span-1",
    large: "col-span-1 md:col-span-2 lg:col-span-2 row-span-2",
    full: "col-span-1 md:col-span-2 lg:col-span-4",
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
            <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{widget.description}</p>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <WidgetContent widget={widget} />
      </div>
    </div>
  );
}

import {
  DashboardWidget,
  StatCardData,
  PieChartData,
  BarChartData,
  InsightListData,
  HypothesisValidation,
  Recommendation,
  MediaEffectivenessMetrics,
  RequiredQuestionCoverage,
  ExtractedQuote
} from "@/lib/analytics";

function WidgetContent({ widget }: { widget: DashboardWidget }) {
  const data = widget.data;

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
    case "insight_list":
      return <InsightListContent data={data} />;
    case "coverage_matrix":
      return <CoverageMatrixContent data={data} />;
    case "media_card":
      return <MediaCardContent data={data} />;
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

const IconComponent = ({ name, className }: { name: string; className?: string }) => {
  const Icon = getIcon(name);
  if (!Icon) return null;
  return <Icon className={className} />;
};

function StatCardContent({ data }: { data: StatCardData }) {
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

      {data.icon && (
        <div className="absolute top-0 right-0 p-2 opacity-5">
          <IconComponent name={data.icon} className="w-16 h-16 text-black" />
        </div>
      )}
    </div>
  );
}

function PieChartContent({ data }: { data: PieChartData }) {
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
              shape={renderPieSector}
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
        {data.segments.slice(0, 4).map((entry, i) => (
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

function BarChartContent({ data }: { data: BarChartData | ChartDataPoint[] }) {
  // Adapter for legacy format or new format
  const chartData = Array.isArray(data) ? data : (data as BarChartData).bars || [];

  if (!chartData.length) return <EmptyState />;

  const INFOGRAPHIC_COLORS = [
    "#F4AF5F", // Orange
    "#E25552", // Red
    "#5C5350", // Brown
    "#94A6A0", // Greenish Gray
    "#4BACBA", // Cyan
    "#BCBCBB"  // Light Gray
  ];

  const getInfographicIcon = (label: string, fallbackIndex: number) => {
    const lowerLabel = (label || "").toLowerCase();

    // Emotion / Sentiment
    if (lowerLabel.includes("satisf") || lowerLabel.includes("happy") || lowerLabel.includes("good") || lowerLabel.includes("great") || lowerLabel.includes("positive") || lowerLabel.includes("love")) return <Smile className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("frustrat") || lowerLabel.includes("sad") || lowerLabel.includes("bad") || lowerLabel.includes("poor") || lowerLabel.includes("negative") || lowerLabel.includes("hate")) return <Frown className="w-5 h-5 text-black" />;

    // Devices / Tech
    if (lowerLabel.includes("app") || lowerLabel.includes("mobile") || lowerLabel.includes("phone")) return <Phone className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("web") || lowerLabel.includes("site") || lowerLabel.includes("desktop") || lowerLabel.includes("computer") || lowerLabel.includes("laptop")) return <Laptop className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("cloud") || lowerLabel.includes("sync") || lowerLabel.includes("online")) return <Cloud className="w-5 h-5 text-black" />;

    // Commerce / Value
    if (lowerLabel.includes("buy") || lowerLabel.includes("purchas") || lowerLabel.includes("cart") || lowerLabel.includes("shop")) return <ShoppingCart className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("price") || lowerLabel.includes("cost") || lowerLabel.includes("money") || lowerLabel.includes("pay") || lowerLabel.includes("budget") || lowerLabel.includes("dollar")) return <DollarSign className="w-5 h-5 text-black" />;

    // People / Users
    if (lowerLabel.includes("user") || lowerLabel.includes("people") || lowerLabel.includes("team") || lowerLabel.includes("customer") || lowerLabel.includes("client") || lowerLabel.includes("employee") || lowerLabel.includes("staff")) return <Users className="w-5 h-5 text-black" />;

    // Time / Process
    if (lowerLabel.includes("time") || lowerLabel.includes("slow") || lowerLabel.includes("fast") || lowerLabel.includes("quick") || lowerLabel.includes("wait") || lowerLabel.includes("hour") || lowerLabel.includes("minute")) return <Clock className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("day") || lowerLabel.includes("week") || lowerLabel.includes("month") || lowerLabel.includes("year") || lowerLabel.includes("date")) return <Calendar className="w-5 h-5 text-black" />;

    // Communication
    if (lowerLabel.includes("support") || lowerLabel.includes("help") || lowerLabel.includes("service") || lowerLabel.includes("contact") || lowerLabel.includes("question") || lowerLabel.includes("issue")) return <HelpCircle className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("chat") || lowerLabel.includes("message") || lowerLabel.includes("talk") || lowerLabel.includes("speak") || lowerLabel.includes("tell")) return <MessageCircle className="w-5 h-5 text-black" />;

    // Geography / Location
    if (lowerLabel.includes("location") || lowerLabel.includes("place") || lowerLabel.includes("city") || lowerLabel.includes("country") || lowerLabel.includes("map") || lowerLabel.includes("address")) return <MapPin className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("global") || lowerLabel.includes("world") || lowerLabel.includes("international")) return <Globe className="w-5 h-5 text-black" />;

    // Performance / Metrics
    if (lowerLabel.includes("score") || lowerLabel.includes("rate") || lowerLabel.includes("rating") || lowerLabel.includes("star")) return <Star className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("goal") || lowerLabel.includes("target") || lowerLabel.includes("objective")) return <Target className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("performance") || lowerLabel.includes("metric") || lowerLabel.includes("data") || lowerLabel.includes("analytics") || lowerLabel.includes("stat")) return <BarChart2 className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("active") || lowerLabel.includes("activity") || lowerLabel.includes("health")) return <Activity className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("fast") || lowerLabel.includes("speed") || lowerLabel.includes("quick") || lowerLabel.includes("instant")) return <Zap className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("safe") || lowerLabel.includes("secure") || lowerLabel.includes("protect") || lowerLabel.includes("privacy")) return <Shield className="w-5 h-5 text-black" />;

    // Generic concepts
    if (lowerLabel.includes("work") || lowerLabel.includes("job") || lowerLabel.includes("office") || lowerLabel.includes("business") || lowerLabel.includes("company")) return <Briefcase className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("home") || lowerLabel.includes("house")) return <Home className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("car") || lowerLabel.includes("drive") || lowerLabel.includes("vehicle") || lowerLabel.includes("transport")) return <Car className="w-5 h-5 text-black" />;
    if (lowerLabel.includes("idea") || lowerLabel.includes("think") || lowerLabel.includes("thought") || lowerLabel.includes("brain") || lowerLabel.includes("creative") || lowerLabel.includes("innovation") || lowerLabel.includes("feature")) return <Lightbulb className="w-5 h-5 text-black" />;

    // Fallback sequence if nothing matches
    switch (fallbackIndex % 6) {
      case 0: return <Lightbulb className="w-5 h-5 text-black" />;
      case 1: return <BarChart2 className="w-5 h-5 text-black" />;
      case 2: return <Users className="w-5 h-5 text-black" />;
      case 3: return <Target className="w-5 h-5 text-black" />;
      case 4: return <MessageCircle className="w-5 h-5 text-black" />;
      case 5: return <Activity className="w-5 h-5 text-black" />;
      default: return <Lightbulb className="w-5 h-5 text-black" />;
    }
  };

  const maxVal = Math.max(...chartData.map((d) => d.value ?? 0), 1);

  return (
    <div className="w-full h-full min-h-[220px] flex items-center bg-[#F2F5F8] rounded-2xl py-6 -mx-2 px-2">
      <div className="flex flex-col w-full h-full justify-center relative">
        {chartData.map((item, i) => {
          const color = item.color || INFOGRAPHIC_COLORS[i % INFOGRAPHIC_COLORS.length];
          // Min width 30%, Max width 70% to leave room for circle and number
          const widthPercent = Math.max(30, Math.min(70, ((item.value || 0) / maxVal) * 70));

          return (
            <div key={i} className="relative flex items-center h-[50px] w-full group">
              {/* Colored Bar */}
              <div
                className="absolute left-0 h-full flex flex-col justify-center px-4 transition-all duration-700 ease-in-out z-0 overflow-hidden"
                style={{
                  width: `${widthPercent}%`,
                  backgroundColor: color,
                  borderTopRightRadius: '9999px',
                  borderBottomRightRadius: '9999px'
                }}
              >
                <div className="text-white/95 font-bold text-[11px] sm:text-[12px] uppercase tracking-wider truncate max-w-[calc(100%-20px)] leading-tight">
                  {item.label}
                </div>
                {item.value !== undefined && (
                  <div className="text-white/70 text-[9px] sm:text-[10px] truncate max-w-[calc(100%-20px)] leading-none mt-1">
                    {item.description || item.value}
                  </div>
                )}
              </div>

              {/* White Circle Base */}
              <div
                className="absolute h-10 w-10 bg-[#F2F5F8] rounded-full z-[5] transition-all duration-700 ease-in-out"
                style={{ left: `calc(${widthPercent}% - 22px)` }}
              />

              {/* White Circle Top */}
              <div
                className="absolute h-11 w-11 bg-white rounded-full flex items-center justify-center z-10 transition-all duration-700 ease-in-out shadow-sm"
                style={{ left: `calc(${widthPercent}% - 22px)` }}
              >
                {getInfographicIcon(item.label, i)}
              </div>

              {/* Number */}
              <div
                className="absolute font-bold text-2xl transition-all duration-700 ease-in-out z-0 flex items-center"
                style={{ left: `calc(${widthPercent}% + 36px)`, color: color }}
              >
                {(i + 1).toString().padStart(2, '0')}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  )
}

function ListContent({ data }: { data: Array<{ label?: string; topic?: string; value: string | number | boolean; count?: number; percentage?: number }> }) {
  if (!data?.length) return <EmptyState />;
  // Assuming data is array of { value, count, percentage } or similar
  // We sort and take top 5
  const limit = 5;
  const sorted = [...data].sort((a, b) => (b.count || b.value) - (a.count || a.value));
  const maxVal = sorted[0]?.count || sorted[0]?.value || 1;

  return (
    <div className="space-y-3 pt-2">
      {sorted.slice(0, limit).map((item, i) => {
        // Determine the label to display: prioritize explicit 'label' or 'topic', fallback to item.value
        const displayLabel = item.label || item.topic || (typeof item.value === 'string' ? item.value : 'Unknown');
        // Determine the numeric value for the count
        const displayCount = item.count ?? item.value;
        const displayPercentage = item.percentage;

        return (
          <div key={i} className="group">
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="font-medium text-gray-700">
                {/* Handle both string/number values */}
                {typeof displayLabel === 'boolean' ? (displayLabel ? 'Yes' : 'No') : displayLabel}
              </span>
              <span className="text-gray-400">
                {displayPercentage ? `${Math.round(displayPercentage)}%` : displayCount}
              </span>
            </div>
            <div className="h-1.5 w-full bg-gray-50 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gray-900 group-hover:bg-black transition-all duration-500"
                style={{
                  width: `${((displayCount) / maxVal) * 100}%`,
                  backgroundColor: COLORS[i % COLORS.length]
                }}
              />
            </div>
          </div>
        )
      })}
      {data.length > limit && (
        <div className="text-[10px] text-center text-gray-400 pt-1">
          + {data.length - limit} more
        </div>
      )}
    </div>
  )
}

function InsightListContent({ data }: { data: InsightListData }) {
  const insights = data.insights || [];
  if (!insights.length) return <EmptyState />;

  return (
    <div className="space-y-3 h-full overflow-y-auto custom-scrollbar pr-2">
      {insights.map((insight, i) => (
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

function CoverageMatrixContent({ data }: { data: RequiredQuestionCoverage[] }) {
  if (!data?.length) return <EmptyState />;

  return (
    <div className="space-y-3 h-full overflow-y-auto custom-scrollbar pr-2">
      {data.map((item, i) => (
        <div key={i} className="p-3 bg-gray-50/50 rounded-xl hover:bg-gray-50 transition-colors">
          <div className="flex justify-between items-start gap-4 mb-2">
            <p className="text-xs font-medium text-gray-900 leading-snug">{item.question}</p>
            <div className={cn(
              "flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap",
              item.coverageRate >= 80 ? "bg-green-100 text-green-700" :
                item.coverageRate >= 50 ? "bg-yellow-100 text-yellow-700" :
                  "bg-red-100 text-red-700"
            )}>
              {Math.round(item.coverageRate)}% covered
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1 mb-2">
            <div
              className="bg-gray-900 h-1.5 rounded-full"
              style={{ width: `${item.coverageRate}%`, opacity: item.coverageRate / 100 }}
            />
          </div>
          {item.sampleResponses && item.sampleResponses.length > 0 && (
            <p className="text-[10px] text-gray-500 italic border-l-2 border-gray-200 pl-2 leading-relaxed">
              &quot;{item.sampleResponses[0]}&quot;
            </p>
          )}
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
  const map: Record<string, React.ElementType> = {
    users: Users,
    "check-circle": CheckCircle,
    star: Star,
    target: Target,
    image: Users, // Fallback
    "play-circle": PlayCircle,
  };
  return map[name] || null;
}

function renderPieSector(props: {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  fill: string;
  payload: { color?: string };
  index: number;
}) {
  const { index, payload } = props;
  return (
    <Sector
      {...props}
      fill={payload.color || COLORS[index % COLORS.length]}
    />
  );
}

function QuoteListContent({ data }: { data: { quotes: ExtractedQuote[] } }) {
  const quotes = data.quotes || [];
  if (!quotes.length) return <EmptyState />;

  return (
    <div className="space-y-4 h-full overflow-y-auto custom-scrollbar p-1">
      {quotes.map((q, i) => (
        <div key={i} className="relative pl-6 italic text-sm text-gray-600">
          <Quote className="absolute left-0 top-0 w-4 h-4 text-gray-300" />
          <p>&quot;{q.text}&quot;</p>
          {q.context && <p className="text-[10px] text-gray-400 not-italic mt-1">— {q.context}</p>}
        </div>
      ))}
    </div>
  )
}

function HypothesisContent({ data }: { data: HypothesisValidation }) {
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
      <p className="text-xs text-gray-500 mt-4 leading-relaxed">{data.summary}</p>
    </div>
  )
}

function RecommendationContent({ data }: { data: Recommendation[] }) {
  if (!data?.length) return <EmptyState />;

  return (
    <div className="space-y-3 h-full overflow-y-auto custom-scrollbar">
      {data.slice(0, 4).map((rec, i) => (
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

function MediaEffectivenessContent({ data }: { data: MediaEffectivenessMetrics[] }) {
  if (!data?.length) return <EmptyState />;

  return (
    <div className="space-y-2">
      {data.slice(0, 5).map((media, i) => (
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

function MediaCardContent({ data }: { data: MediaEffectivenessMetrics }) {
  if (!data) return <EmptyState />;
  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-xl p-3 overflow-hidden">
      <div className="flex justify-between items-start mb-2">
        <div className="text-xs font-bold uppercase tracking-wider text-gray-500">{data.type}</div>
        <div className="text-xs font-bold text-gray-900">{Math.round(data.effectivenessScore * 10)}/10 Score</div>
      </div>
      <p className="text-sm font-medium text-gray-900 mb-2 leading-snug">{data.description}</p>
      <div className="mt-auto space-y-2">
        <div className="flex justify-between text-[10px] text-gray-500">
          <span>Usage: {data.usageRate}%</span>
          <span>Insights: {data.insightsGenerated}</span>
        </div>
        {data.topQuotes && data.topQuotes.length > 0 && (
          <p className="text-xs italic text-gray-600 bg-white p-2 rounded border border-gray-100 leading-relaxed">
            &quot;{data.topQuotes[0].text}&quot;
          </p>
        )}
      </div>
    </div>
  )
}
