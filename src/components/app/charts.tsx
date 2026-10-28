"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXIS = { stroke: "var(--border)", tick: { fill: "var(--muted-foreground)", fontSize: 11 }, tickLine: false };
const GRID = { stroke: "var(--border)", strokeDasharray: "0", vertical: false };

type Formatter = (v: number) => string;

interface TooltipLike {
  active?: boolean;
  label?: unknown;
  payload?: ReadonlyArray<{ dataKey?: unknown; name?: unknown; value?: unknown; color?: string }>;
}

function ChartTooltip({ active, payload, label, format }: TooltipLike & { format?: Formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{String(label ?? "")}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
          {String(p.name)}: <span className="font-medium text-foreground tabular-nums">{p.value === null || p.value === undefined ? "No data" : format ? format(Number(p.value)) : String(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

const cursor = { fill: "var(--muted)", opacity: 0.5 };

export function SingleBarChart({
  data,
  xKey,
  yKey,
  name,
  color,
  yLabel,
  format,
  height = 220,
}: {
  data: object[];
  xKey: string;
  yKey: string;
  name: string;
  color: string;
  yLabel: string;
  format?: Formatter;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barCategoryGap="25%">
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={12} />
        <YAxis
          {...AXIS}
          allowDecimals={false}
          width={44}
          axisLine={false}
          label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 11, dy: 30 }}
        />
        <Tooltip cursor={cursor} content={(p: TooltipLike) => <ChartTooltip {...p} format={format} />} />
        <Bar dataKey={yKey} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TwoSeriesBarChart({
  data,
  xKey,
  series,
  yLabel,
  height = 220,
  layout = "horizontal",
}: {
  data: object[];
  xKey: string;
  series: Array<{ key: string; name: string; color: string }>;
  yLabel: string;
  height?: number;
  layout?: "horizontal" | "vertical";
}) {
  const vertical = layout === "vertical";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={2} barCategoryGap="25%">
        <CartesianGrid {...GRID} vertical={vertical} horizontal={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" {...AXIS} allowDecimals={false} label={{ value: yLabel, position: "insideBottom", offset: -2, fill: "var(--muted-foreground)", fontSize: 11 }} height={36} />
            <YAxis type="category" dataKey={xKey} {...AXIS} width={64} axisLine={false} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} {...AXIS} />
            <YAxis {...AXIS} allowDecimals={false} width={44} axisLine={false} label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 11, dy: 30 }} />
          </>
        )}
        <Tooltip cursor={cursor} content={(p: TooltipLike) => <ChartTooltip {...p} />} />
        <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={18} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RateLineChart({
  data,
  xKey,
  yKey,
  name,
  color,
  height = 220,
}: {
  data: object[];
  xKey: string;
  yKey: string;
  name: string;
  color: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} {...AXIS} />
        <YAxis
          {...AXIS}
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v) => `${v}%`}
          width={48}
          axisLine={false}
          label={{ value: "On time", angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 11, dy: 26 }}
        />
        <Tooltip content={(p: TooltipLike) => <ChartTooltip {...p} format={(v) => `${Math.round(v)}%`} />} cursor={{ stroke: "var(--border)" }} />
        <Line type="monotone" dataKey={yKey} name={name} stroke={color} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TrendAreaChart({
  data,
  xKey,
  yKey,
  name,
  color,
  yLabel,
  height = 220,
}: {
  data: object[];
  xKey: string;
  yKey: string;
  name: string;
  color: string;
  yLabel: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={12} />
        <YAxis {...AXIS} allowDecimals={false} width={44} axisLine={false} label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 11, dy: 30 }} />
        <Tooltip content={(p: TooltipLike) => <ChartTooltip {...p} />} cursor={{ stroke: "var(--border)" }} />
        <Area type="monotone" dataKey={yKey} name={name} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.12} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
