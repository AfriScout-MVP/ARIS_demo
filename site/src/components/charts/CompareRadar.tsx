"use client";

import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { chartColors, tooltipStyle } from "./theme";

/** Two officials only: green for A, sky for B — no third series to confuse. Values are grid marks, 0–10. */
const series = [chartColors.pitch, chartColors.var];

export function CompareRadar({
  data,
  seriesNames,
}: {
  data: Record<string, string | number>[];
  seriesNames: string[];
}) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="68%">
          <PolarGrid stroke={chartColors.grid} />
          <PolarAngleAxis dataKey="metric" tick={{ fill: chartColors.faint, fontSize: 10 }} />
          <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11, color: chartColors.chalkDim }} />
          {seriesNames.map((name, i) => (
            <Radar
              key={name}
              name={name}
              dataKey={name}
              stroke={series[i % series.length]}
              fill={series[i % series.length]}
              fillOpacity={0.12}
              strokeWidth={1.8}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
