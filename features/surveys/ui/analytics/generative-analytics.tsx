"use client";

import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/ui/chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/shared/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

const generatedChartColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

interface ChartDataPoint {
  color?: string;
  label: string;
  value: number;
}

interface ChartProps {
  config?: {
    dataKey?: string;
    xAxisKey?: string;
  };
  data: ChartDataPoint[];
  description?: string;
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isChartDataPointArray(value: unknown): value is ChartDataPoint[] {
    return Array.isArray(value) && value.every((item) => (
        isRecord(item) &&
        typeof item.label === "string" &&
        typeof item.value === "number"
    ));
}

export function isRenderChartResult(value: unknown): value is RenderChartResult {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.type === "string" &&
        (value.type === "bar" || value.type === "pie" || value.type === "line") &&
        typeof value.title === "string" &&
        isChartDataPointArray(value.data)
    );
}

export function isRenderTableResult(value: unknown): value is RenderTableResult {
    if (!isRecord(value)) {
        return false;
    }

    return (
        !("type" in value) &&
        typeof value.title === "string" &&
        Array.isArray(value.columns) &&
        Array.isArray(value.rows)
    );
}

const axisStyle = {
  fill: "#9ca3af",
  fontSize: 11,
};

const generatedValueChartConfig = {
  value: {
    color: "var(--color-chart-1)",
    label: "Value",
  },
} satisfies ChartConfig;

function getGeneratedChartFill(point: ChartDataPoint, index: number) {
  return point.color ?? generatedChartColors[index % generatedChartColors.length];
}

function GeneratedChartHeading({
  description,
  title,
}: {
  description?: string;
  title: string;
}) {
  return (
    <div className="mb-4">
      <h4 className="text-sm font-bold tracking-tight text-gray-900">{title}</h4>
      {description ? (
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      ) : null}
    </div>
  );
}

export function GenerativeBarChart({ data, title, description }: ChartProps) {
  return (
    <div className="my-6 w-full">
      <GeneratedChartHeading title={title} description={description} />
      <ChartContainer config={generatedValueChartConfig} className="h-64 w-full">
        <BarChart
          accessibilityLayer
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
          <ChartTooltip
            cursor={{ fill: "transparent" }}
            content={<ChartTooltipContent hideLabel nameKey="label" />}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
            {data.map((entry, index) => (
              <Cell
                key={`${entry.label}-${index}`}
                fill={getGeneratedChartFill(entry, index)}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

export function GenerativePieChart({ data, title, description }: ChartProps) {
  return (
    <div className="my-6 w-full">
      <GeneratedChartHeading title={title} description={description} />
      <ChartContainer config={generatedValueChartConfig} className="h-64 w-full">
        <PieChart accessibilityLayer>
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
                key={`${entry.label}-${index}`}
                fill={getGeneratedChartFill(entry, index)}
              />
            ))}
          </Pie>
          <ChartTooltip
            content={<ChartTooltipContent hideLabel nameKey="label" />}
          />
        </PieChart>
      </ChartContainer>
    </div>
  );
}

export function GenerativeLineChart({ data, title, description, config }: ChartProps) {
  const dataKey = config?.dataKey || "value";
  const xAxisKey = config?.xAxisKey || "label";

  return (
    <div className="my-6 w-full">
      <GeneratedChartHeading title={title} description={description} />
      <ChartContainer config={generatedValueChartConfig} className="h-64 w-full">
        <LineChart
          accessibilityLayer
          data={data}
          margin={{ top: 10, right: 20, left: -20, bottom: 0 }}
        >
          <XAxis
            dataKey={xAxisKey}
            axisLine={false}
            tickLine={false}
            style={axisStyle}
            tickMargin={10}
          />
          <YAxis axisLine={false} tickLine={false} style={axisStyle} />
          <ChartTooltip
            content={<ChartTooltipContent indicator="line" />}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke="var(--color-value)"
            strokeWidth={2.5}
            dot={{
              fill: "var(--color-value)",
              r: 4,
              strokeWidth: 0,
            }}
            activeDot={{ fill: "var(--color-value)", r: 6 }}
          />
        </LineChart>
      </ChartContainer>
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
    <Card className="my-6 w-full rounded-[2rem]">
      <CardHeader className="pb-4">
        <CardTitle className="text-sm font-bold tracking-tight text-gray-900">
          {title}
        </CardTitle>
        {description ? (
          <CardDescription className="text-xs text-gray-500">
            {description}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={`${rowIndex}-${cellIndex}`}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
    if (toolName === "renderChart" && isRenderChartResult(result)) {
        const chartResult = result;
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

    if (toolName === "renderTable" && isRenderTableResult(result)) {
        const tableResult = result;
        const { title, description, columns, rows } = tableResult;
        return <GenerativeTable title={title} description={description} columns={columns} rows={rows} />;
    }

    return null;
}
