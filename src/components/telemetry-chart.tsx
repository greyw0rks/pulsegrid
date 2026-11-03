"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { at: string; latencyMs: number | null; success: boolean; blockHeight: string | null };

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function TelemetryChart({ data }: { data: Point[] }) {
  const gradientId = useId().replaceAll(":", "");
  if (!data.length) return <div className="empty">Awaiting the first observation.</div>;
  return (
    <div className="chart-wrap" role="img" aria-label={`Recent endpoint latency across ${data.length} retained observations`}>
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart data={data} margin={{ top: 7, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="at" tickFormatter={timeLabel} minTickGap={40} tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={54} unit=" ms" />
          <Tooltip labelFormatter={value => timeLabel(String(value))} formatter={(value) => [`${value ?? "failed"} ms`, "Latency"]}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 7, fontSize: 12 }} />
          <Area type="monotone" dataKey="latencyMs" stroke="var(--accent)" strokeWidth={1.5} fill={`url(#${gradientId})`} connectNulls={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
