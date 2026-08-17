"use client";

import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";

export function SubIndexRadar({
  data,
}: {
  data: { metric: string; value: number }[];
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="75%">
          <PolarGrid stroke="#1c2837" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: "#8b9bb0", fontSize: 11 }} />
          <PolarRadiusAxis domain={[50, 100]} tick={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "#0d141e", border: "1px solid #1c2837", borderRadius: 10, fontSize: 12, color: "#eef3f8" }}
          />
          <Radar dataKey="value" stroke="#17c778" fill="#17c778" fillOpacity={0.28} strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
