'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface LiveBarChartProps {
  data: { answer: string; count: number; percentage: number }[];
  correctAnswer?: string | null;
  revealAnswer?: boolean;
}

export default function LiveBarChart({ data, correctAnswer, revealAnswer }: LiveBarChartProps) {
  return (
    <div className="w-full h-64 md:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="answer"
            width={80}
            tick={{ fill: '#0f2a43', fontSize: 14 }}
          />
          <Tooltip
            formatter={(value: number, name: string, props: any) => [`${value} (${props.payload.percentage}%)`, 'Responses']}
          />
          <Bar dataKey="count" radius={[0, 8, 8, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={
                  revealAnswer && correctAnswer && entry.answer.startsWith(correctAnswer)
                    ? '#0e7c7b'
                    : '#94a3b8'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}