"use client";

import {
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { ClientT } from "@/components/i18n/client-t";

const COLORS = ["#111827", "#374151", "#6B7280", "#9CA3AF", "#D1D5DB"];

interface ChartDataPoint {
    label: string;
    value: number;
    color?: string;
}

interface ChartProps {
    data: ChartDataPoint[];
    title: string;
    description?: string;
    config?: {
        dataKey?: string;
        xAxisKey?: string;
    };
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{ value: number; name: string; color?: string; payload: ChartDataPoint }>;
    label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white p-3 shadow-lg rounded-xl border border-gray-100 text-[11px]">
                <p className="font-bold text-gray-900 mb-1">{label}</p>
                <p className="text-gray-600">
                    <ClientT>Value</ClientT>: <span className="font-semibold text-gray-900">{payload[0].value}</span>
                </p>
            </div>
        );
    }
    return null;
};

const axisStyle = {
    fontSize: 11,
    fill: "#9ca3af",
};

export function GenerativeBarChart({ data, title, description }: ChartProps) {
    return (
        <div className="w-full my-6">
            <div className="mb-4">
                <h4 className="text-sm font-bold text-gray-900 tracking-tight">{title}</h4>
                {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
            </div>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                        <XAxis type="number" hide />
                        <YAxis
                            dataKey="label"
                            type="category"
                            axisLine={false}
                            tickLine={false}
                            width={100}
                            style={axisStyle}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color || COLORS[index % COLORS.length]}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export function GenerativePieChart({ data, title, description }: ChartProps) {
    return (
        <div className="w-full my-6">
            <div className="mb-4">
                <h4 className="text-sm font-bold text-gray-900 tracking-tight">{title}</h4>
                {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
            </div>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={4}
                            dataKey="value"
                            nameKey="label"
                            stroke="none"
                        >
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color || COLORS[index % COLORS.length]}
                                />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export function GenerativeLineChart({ data, title, description, config }: ChartProps) {
    const dataKey = config?.dataKey || "value";
    const xAxisKey = config?.xAxisKey || "label";

    return (
        <div className="w-full my-6">
            <div className="mb-4">
                <h4 className="text-sm font-bold text-gray-900 tracking-tight">{title}</h4>
                {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
            </div>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                        <XAxis
                            dataKey={xAxisKey}
                            axisLine={false}
                            tickLine={false}
                            style={axisStyle}
                            dy={10}
                        />
                        <YAxis axisLine={false} tickLine={false} style={axisStyle} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line
                            type="monotone"
                            dataKey={dataKey}
                            stroke="#111827"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: "#111827", strokeWidth: 0 }}
                            activeDot={{ r: 6, fill: "#111827" }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

interface TableProps {
    title: string;
    description?: string;
    columns: string[];
    rows: string[][];
}

export function GenerativeTable({ title, description, columns, rows }: TableProps) {
    return (
        <div className="w-full my-6">
            <div className="mb-4">
                <h4 className="text-sm font-bold text-gray-900 tracking-tight">{title}</h4>
                {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-gray-100">
                            {columns.map((col, i) => (
                                <th
                                    key={i}
                                    className="py-3 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider"
                                >
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-gray-50/50 transition-colors">
                                {row.map((cell, cellIndex) => (
                                    <td key={cellIndex} className="py-3 px-4 text-sm text-gray-700 font-medium">
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export interface RenderChartResult {
    type: "bar" | "pie" | "line";
    title: string;
    description?: string;
    data: ChartDataPoint[];
    config?: {
        dataKey?: string;
        xAxisKey?: string;
    };
}

export interface RenderTableResult {
    title: string;
    description?: string;
    columns: string[];
    rows: string[][];
}

export function GenerativeAnalyticsRenderer({
    toolName,
    result,
}: {
    toolName: string;
    result: RenderChartResult | RenderTableResult;
}) {
    if (toolName === "renderChart") {
        const chartResult = result as RenderChartResult;
        const { type, title, description, data, config } = chartResult;
        switch (type) {
            case "bar":
                return <GenerativeBarChart data={data} title={title} description={description} config={config} />;
            case "pie":
                return <GenerativePieChart data={data} title={title} description={description} config={config} />;
            case "line":
                return <GenerativeLineChart data={data} title={title} description={description} config={config} />;
            default:
                return null;
        }
    }

    if (toolName === "renderTable") {
        const tableResult = result as RenderTableResult;
        const { title, description, columns, rows } = tableResult;
        return <GenerativeTable title={title} description={description} columns={columns} rows={rows} />;
    }

    return null;
}
