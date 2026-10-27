"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { chartColors, tooltipStyle } from "./theme";

export function SubIndexRadar({ data }: { data: { metric: string; value: number }[] }) {
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke={chartColors.grid} />
          <PolarAngleAxis dataKey="metric" tick={{ fill: chartColors.faint, fontSize: 10 }} />
          <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Radar
            dataKey="value"
            stroke={chartColors.pitch}
            fill={chartColors.pitch}
            fillOpacity={0.18}
            strokeWidth={1.8}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
