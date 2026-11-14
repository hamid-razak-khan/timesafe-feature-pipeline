import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

export default function QualityChart({ runs = [], rejects = [] }) {
  // 1. Accepted vs Rejected per run data
  const runComparisonData = runs
    .slice(0, 10)
    .reverse()
    .map((r) => ({
      name: r.run_id.replace('RUN_', '').substring(0, 11),
      accepted: r.accepted_rows,
      rejected: r.rejected_rows,
      duration: Number(r.duration_seconds).toFixed(2),
    }));

  // 2. Rejection reasons aggregation
  const reasonCounts = {};
  rejects.forEach((rej) => {
    // Simplify reason for chart
    let clean = rej.rejection_reason || 'Unknown';
    if (clean.includes(':')) clean = clean.split(':')[0];
    reasonCounts[clean] = (reasonCounts[clean] || 0) + 1;
  });

  const reasonData = Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const COLORS = ['#f43f5e', '#f59e0b', '#8B5CF6', '#A855F7', '#D8B4FE'];

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#10101F] border border-[rgba(168,85,247,0.3)] p-2.5 rounded-lg shadow-xl text-xs">
          <p className="font-semibold text-[#F8F7FF] mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="flex justify-between space-x-4">
              <span>{entry.name}:</span>
              <span className="font-mono font-bold">{entry.value}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Chart 1: Row Classification Across Recent Runs */}
      <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-xl p-5 shadow-sm">
        <h4 className="text-xs font-semibold text-[#F8F7FF] uppercase tracking-wider mb-1">
          Accepted vs Rejected Rows (Recent Runs)
        </h4>
        <p className="text-[11px] text-[#A1A1B5] mb-4">Reconciliation classification verification</p>

        <div className="h-64 w-full">
          {runComparisonData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-[#A1A1B5]">
              No pipeline run data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={runComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,0.1)" />
                <XAxis dataKey="name" stroke="#A1A1B5" fontSize={10} tickLine={false} />
                <YAxis stroke="#A1A1B5" fontSize={10} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(168, 85, 247, 0.08)' }} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="accepted" name="Accepted Rows" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rejected" name="Quarantined Rejects" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Chart 2: Top Rejection Reasons Distribution */}
      <div className="bg-[#16112B] border border-[rgba(168,85,247,0.18)] rounded-xl p-5 shadow-sm">
        <h4 className="text-xs font-semibold text-[#F8F7FF] uppercase tracking-wider mb-1">
          Top Quarantined Rejection Reasons
        </h4>
        <p className="text-[11px] text-[#A1A1B5] mb-4">Breakdown of schema and referential integrity anomalies</p>

        <div className="h-64 w-full">
          {reasonData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-[#A1A1B5]">
              No rejected records recorded (100% clean data)
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={reasonData} margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,85,247,0.1)" />
                <XAxis type="number" stroke="#A1A1B5" fontSize={10} tickLine={false} />
                <YAxis
                  dataKey="reason"
                  type="category"
                  stroke="#A1A1B5"
                  fontSize={10}
                  tickLine={false}
                  width={140}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(168, 85, 247, 0.08)' }} />
                <Bar dataKey="count" name="Rejections" fill="#f43f5e" radius={[0, 4, 4, 0]}>
                  {reasonData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

