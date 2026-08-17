"use client";

import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = ["#17c778", "#e2b13c", "#3b82f6"];

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
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="#1c2837" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: "#8b9bb0", fontSize: 11 }} />
          <PolarRadiusAxis domain={[50, 100]} tick={false} axisLine={false} />
          <Tooltip contentStyle={{ background: "#0d141e", border: "1px solid #1c2837", borderRadius: 10, fontSize: 12, color: "#eef3f8" }} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#8b9bb0" }} />
          {seriesNames.map((name, i) => (
            <Radar
              key={name}
              name={name}
              dataKey={name}
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.18}
              strokeWidth={2}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
