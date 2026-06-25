"use client";

import {
  Cell,
  Pie,
  PieChart,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/ui/chart";

interface UsageTypeChartProps {
  data: Array<{
    count: number;
    name: string;
    value: number;
  }>;
}

const usageTypeChartConfig = {
  value: {
    label: "Cost",
  },
} satisfies ChartConfig;

const usageTypeChartColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export function UsageTypeChart({ data }: UsageTypeChartProps) {
  return (
    <ChartContainer config={usageTypeChartConfig} className="h-[350px] w-full">
      <PieChart accessibilityLayer>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={5}
          dataKey="value"
          nameKey="name"
          stroke="none"
        >
          {data.map((entry, index) => (
            <Cell
              key={entry.name}
              fill={usageTypeChartColors[index % usageTypeChartColors.length]}
            />
          ))}
        </Pie>
        <ChartTooltip
          content={
            <ChartTooltipContent
              nameKey="name"
              hideIndicator
              hideLabel
              formatter={(value) => (
                <>
                  <span className="text-muted-foreground">Cost</span>
                  <span className="font-medium text-foreground">
                    ${Number(value ?? 0).toFixed(2)}
                  </span>
                </>
              )}
            />
          }
        />
        <ChartLegend
          verticalAlign="bottom"
          height={36}
          content={<ChartLegendContent />}
        />
      </PieChart>
    </ChartContainer>
  );
}
