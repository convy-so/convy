"use client";

import * as React from "react";
import {
  Legend as RechartsLegend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";

import { cn } from "@/shared/ui/tailwind-class-utils";

type ChartSeriesConfig = {
  color?: string;
  icon?: React.ComponentType<{ className?: string }>;
  label?: React.ReactNode;
};

export type ChartConfig = Record<string, ChartSeriesConfig>;

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("Chart components must be rendered inside ChartContainer.");
  }

  return context;
}

function buildChartVariableStyles(config: ChartConfig) {
  const variableStyles: Record<string, string> = {};

  for (const [seriesKey, seriesConfig] of Object.entries(config)) {
    if (seriesConfig.color) {
      variableStyles[`--color-${seriesKey}`] = seriesConfig.color;
    }
  }

  return variableStyles as React.CSSProperties;
}

function isPrimitiveLabel(value: React.ReactNode): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

type ChartContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  config: ChartConfig;
};

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ children, className, config, style, ...props }, ref) => {
    const chartId = React.useId().replace(/:/g, "");

    return (
      <ChartContext.Provider value={{ config }}>
        <div
          ref={ref}
          data-chart={chartId}
          data-slot="chart"
          className={cn(
            "flex w-full justify-center text-xs",
            "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
            "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/60",
            "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
            "[&_.recharts-layer]:outline-none",
            "[&_.recharts-pie-label-text]:fill-foreground",
            "[&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border/60",
            "[&_.recharts-radial-bar-background-sector]:fill-muted",
            "[&_.recharts-reference-line_[stroke='#ccc']]:stroke-border/60",
            "[&_.recharts-sector]:outline-none",
            "[&_.recharts-surface]:outline-none",
            className,
          )}
          style={{
            ...buildChartVariableStyles(config),
            ...style,
          }}
          {...props}
        >
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    );
  },
);
ChartContainer.displayName = "ChartContainer";

type TooltipEntry = {
  color?: string;
  dataKey?: number | string;
  fill?: string;
  name?: number | string;
  payload?: Record<string, unknown>;
  value?: number | string;
};

function getTooltipSeriesKey(
  item: TooltipEntry,
  nameKey?: string,
) {
  const namedPayloadValue = nameKey ? item.payload?.[nameKey] : undefined;

  if (typeof namedPayloadValue === "string") {
    return namedPayloadValue;
  }

  if (typeof item.dataKey === "string") {
    return item.dataKey;
  }

  if (typeof item.name === "string") {
    return item.name;
  }

  return undefined;
}

function formatTooltipValue(value: TooltipEntry["value"]) {
  if (typeof value === "number") {
    return value.toLocaleString();
  }

  return value ?? "";
}

export const ChartTooltip = RechartsTooltip;

type ChartTooltipContentProps = React.HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  formatter?: (
    value: TooltipEntry["value"],
    name: string,
    item: TooltipEntry,
    index: number,
  ) => React.ReactNode;
  hideIndicator?: boolean;
  hideLabel?: boolean;
  indicator?: "dot" | "line";
  label?: number | string;
  labelFormatter?: (
    label: number | string | undefined,
    payload: TooltipEntry[],
  ) => React.ReactNode;
  nameKey?: string;
  payload?: TooltipEntry[];
};

function ChartTooltipContent({
  active,
  className,
  formatter,
  hideIndicator = false,
  hideLabel = false,
  indicator = "dot",
  label,
  labelFormatter,
  nameKey,
  payload,
}: ChartTooltipContentProps) {
  const { config } = useChart();

  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const firstItem = payload[0];
  const firstSeriesKey = firstItem ? getTooltipSeriesKey(firstItem, nameKey) : undefined;
  const configuredFirstLabel = firstSeriesKey
    ? config[firstSeriesKey]?.label
    : undefined;
  const payloadLabel = nameKey ? firstItem?.payload?.[nameKey] : undefined;
  const resolvedLabel =
    typeof label === "string" || typeof label === "number"
      ? label
      : typeof payloadLabel === "string" || typeof payloadLabel === "number"
        ? payloadLabel
        : isPrimitiveLabel(configuredFirstLabel)
          ? configuredFirstLabel
          : firstItem?.name;

  return (
    <div
      className={cn(
        "grid min-w-[10rem] gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-xs shadow-xl",
        className,
      )}
    >
      {!hideLabel && (
        <div className="font-medium text-foreground">
          {labelFormatter
            ? labelFormatter(
                typeof resolvedLabel === "string" || typeof resolvedLabel === "number"
                  ? resolvedLabel
                  : undefined,
                payload,
              )
            : resolvedLabel}
        </div>
      )}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const seriesKey = getTooltipSeriesKey(item, nameKey);
          const configuredLabel = seriesKey ? config[seriesKey]?.label : undefined;
          const seriesName = isPrimitiveLabel(configuredLabel)
            ? String(configuredLabel)
            : typeof item.name === "string" || typeof item.name === "number"
              ? String(item.name)
              : seriesKey ?? "Value";
          const indicatorColor =
            item.color ??
            item.fill ??
            (seriesKey ? `var(--color-${seriesKey})` : "var(--color-chart-1)");

          return (
            <div key={`${seriesName}-${index}`} className="flex items-center gap-2">
              {!hideIndicator && (
                <span
                  className={cn(
                    "shrink-0 rounded-sm",
                    indicator === "line" ? "h-0.5 w-3" : "h-2.5 w-2.5",
                  )}
                  style={{ backgroundColor: indicatorColor }}
                />
              )}
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                {formatter ? (
                  formatter(item.value, seriesName, item, index)
                ) : (
                  <>
                    <span className="truncate text-muted-foreground">
                      {seriesName}
                    </span>
                    <span className="font-medium text-foreground">
                      {formatTooltipValue(item.value)}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ChartLegend = RechartsLegend;

type LegendEntry = {
  color?: string;
  dataKey?: number | string;
  payload?: Record<string, unknown>;
  value?: number | string;
};

type ChartLegendContentProps = React.HTMLAttributes<HTMLDivElement> & {
  hideIcon?: boolean;
  nameKey?: string;
  payload?: LegendEntry[];
};

function ChartLegendContent({
  className,
  hideIcon = false,
  nameKey,
  payload,
}: ChartLegendContentProps) {
  const { config } = useChart();

  if (!payload || payload.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-4", className)}>
      {payload.map((item, index) => {
        const payloadName = nameKey ? item.payload?.[nameKey] : undefined;
        const seriesKey =
          typeof payloadName === "string"
            ? payloadName
            : typeof item.dataKey === "string"
              ? item.dataKey
              : undefined;
        const configuredLabel = seriesKey ? config[seriesKey]?.label : undefined;
        const label = isPrimitiveLabel(configuredLabel)
          ? configuredLabel
          : item.value ?? seriesKey ?? "Series";
        const iconColor =
          item.color ??
          (seriesKey ? `var(--color-${seriesKey})` : "var(--color-chart-1)");

        return (
          <div key={`${String(label)}-${index}`} className="flex items-center gap-2">
            {!hideIcon && (
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: iconColor }}
              />
            )}
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export {
  ChartContainer,
  ChartLegendContent,
  ChartTooltipContent,
};
