"use client";

import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line
} from "recharts";

const COLORS = ["#111827", "#374151", "#6B7280", "#9CA3AF", "#D1D5DB"];

interface ChartProps {
    data: any[];
    title: string;
    description?: string;
    config?: any;
}

export function GenerativeBarChart({ data, title, description, config }: ChartProps) {
    return (
        <div className="w-full h-64 bg-white rounded-3xl border border-gray-100 p-4 shadow-sm my-2">
            <div className="mb-2">
                <h4 className="text-sm font-bold text-gray-900 leading-tight">{title}</h4>
                {description && <p className="text-[10px] text-gray-500 mt-0.5">{description}</p>}
            </div>
            <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis
                            dataKey="label"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            stroke="#9ca3af"
                            interval={0}
                            tickFormatter={(v) => (v.length > 10 ? `${v.slice(0, 10)}...` : v)}
                        />
                        <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="#9ca3af" />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', fontSize: '10px' }} />
                        <Bar dataKey="value" fill="#111827" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
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
