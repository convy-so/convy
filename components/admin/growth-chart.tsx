"use client";

import {
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Bar,
  ComposedChart,
} from "recharts";

interface GrowthChartProps {
  data: Array<{
    date: string;
    newUsers: number;
    cost: number;
  }>;
}

export function GrowthChart({ data }: GrowthChartProps) {
  return (
    <div className="h-[350px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <defs>
            <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.1} />
              <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="#F1F5F9"
          />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#64748B" }}
            dy={10}
          />
          <YAxis
            yAxisId="left"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#64748B" }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#64748B" }}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid #E2E8F0",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
          />
          <Legend verticalAlign="top" align="right" height={36} />

          <Area
            yAxisId="left"
            type="monotone"
            dataKey="newUsers"
            stroke="#4F46E5"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorUsers)"
            name="New Users"
          />

          <Bar
            yAxisId="right"
            dataKey="cost"
            barSize={20}
            fill="#F43F5E"
            radius={[4, 4, 0, 0]}
            name="AI Cost ($)"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
