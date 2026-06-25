"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/ui/chart";

interface GrowthChartProps {
  data: Array<{
    date: string;
    newUsers: number;
    cost: number;
  }>;
}

const growthChartConfig = {
  cost: {
    color: "var(--color-chart-2)",
    label: "AI Cost",
  },
  newUsers: {
    color: "var(--color-chart-1)",
    label: "New Users",
  },
} satisfies ChartConfig;

export function GrowthChart({ data }: GrowthChartProps) {
  return (
    <ChartContainer config={growthChartConfig} className="h-[350px] w-full">
      <ComposedChart accessibilityLayer data={data}>
          <defs>
            <linearGradient id="growth-new-users" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-newUsers)"
                stopOpacity={0.18}
              />
              <stop
                offset="95%"
                stopColor="var(--color-newUsers)"
                stopOpacity={0}
              />
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
            tickMargin={10}
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
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <>
                    <span className="truncate text-muted-foreground">{name}</span>
                    <span className="font-medium text-foreground">
                      {name === "AI Cost"
                        ? `$${Number(value ?? 0).toFixed(2)}`
                        : Number(value ?? 0).toLocaleString()}
                    </span>
                  </>
                )}
              />
            }
          />
          <ChartLegend
            verticalAlign="top"
            align="right"
            height={36}
            content={<ChartLegendContent />}
          />

          <Area
            yAxisId="left"
            type="monotone"
            dataKey="newUsers"
            stroke="var(--color-newUsers)"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#growth-new-users)"
          />

          <Bar
            yAxisId="right"
            dataKey="cost"
            barSize={20}
            fill="var(--color-cost)"
            radius={[4, 4, 0, 0]}
          />
      </ComposedChart>
    </ChartContainer>
  );
}
