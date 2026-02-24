"use client";

import {
    PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import {
    Lightbulb, Car, MapPin, BarChart2, Laptop, Cloud,
    Smile, Frown, Phone, Activity, ShoppingCart, Users,
    Clock, DollarSign, Calendar, MessageCircle, Star, Target,
    Heart, Home, Briefcase, Zap, Globe, Shield, HelpCircle
} from "lucide-react";

const COLORS = ["#111827", "#374151", "#6B7280", "#9CA3AF", "#D1D5DB"];

interface ChartProps {
    data: any[];
    title: string;
    description?: string;
    config?: any;
}

export function GenerativeBarChart({ data, title, description, config }: ChartProps) {
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

    const maxVal = Math.max(...(data || []).map((d: any) => d.value ?? 0), 1);

    return (
        <div className="w-full flex flex-col bg-white rounded-3xl border border-gray-100 p-4 shadow-sm my-2">
            <div className="mb-4">
                <h4 className="text-sm font-bold text-gray-900 leading-tight">{title}</h4>
                {description && <p className="text-[10px] text-gray-500 mt-0.5">{description}</p>}
            </div>

            <div className="w-[calc(100%+16px)] bg-[#F2F5F8] rounded-2xl py-6 -mx-2 px-2 flex-grow overflow-x-hidden min-h-[200px]">
                <div className="flex flex-col w-full h-full justify-center relative gap-0.5">
                    {data.map((item: any, i: number) => {
                        const color = item.color || INFOGRAPHIC_COLORS[i % INFOGRAPHIC_COLORS.length];
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
        </div>
    );
}

export function GenerativePieChart({ data, title, description }: ChartProps) {
    return (
        <div className="w-full h-64 bg-white rounded-3xl border border-gray-100 p-4 shadow-sm my-2">
            <div className="mb-2">
                <h4 className="text-sm font-bold text-gray-900 leading-tight">{title}</h4>
                {description && <p className="text-[10px] text-gray-500 mt-0.5">{description}</p>}
            </div>
            <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            innerRadius={40}
                            outerRadius={60}
                            paddingAngle={5}
                            dataKey="value"
                            nameKey="label"
                            stroke="none"
                            cornerRadius={4}
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', fontSize: '10px' }} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export function GenerativeLineChart({ data, title, description, config }: ChartProps) {
    const dataKey = config?.dataKey || "y";
    const xAxisKey = config?.xAxisKey || "x";

    return (
        <div className="w-full h-64 bg-white rounded-3xl border border-gray-100 p-4 shadow-sm my-2">
            <div className="mb-2">
                <h4 className="text-sm font-bold text-gray-900 leading-tight">{title}</h4>
                {description && <p className="text-[10px] text-gray-500 mt-0.5">{description}</p>}
            </div>
            <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey={xAxisKey} fontSize={10} tickLine={false} axisLine={false} stroke="#9ca3af" />
                        <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="#9ca3af" />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', fontSize: '10px' }} />
                        <Line
                            type="monotone"
                            dataKey={dataKey}
                            stroke="#111827"
                            strokeWidth={2}
                            dot={{ r: 3, fill: '#111827', strokeWidth: 0 }}
                            activeDot={{ r: 5, fill: '#111827' }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export function GenerativeAnalyticsRenderer({ toolName, result }: { toolName: string; result: any }) {
    if (toolName !== 'renderChart') return null;

    const { type, title, description, data, config } = result;

    switch (type) {
        case 'bar':
            return <GenerativeBarChart data={data} title={title} description={description} config={config} />;
        case 'pie':
            return <GenerativePieChart data={data} title={title} description={description} config={config} />;
        case 'line':
            return <GenerativeLineChart data={data} title={title} description={description} config={config} />;
        default:
            return null;
    }
}
