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

  const COLORS = ['#f43f5e', '#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4'];

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0a0f1d] border border-slate-700 p-2.5 rounded-lg shadow-lg text-xs">
          <p className="font-semibold text-slate-200 mb-1">{label}</p>
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
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 shadow-sm">
        <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-1">
          Accepted vs Rejected Rows (Recent Runs)
        </h4>
        <p className="text-[11px] text-slate-500 mb-4">Reconciliation classification verification</p>

        <div className="h-64 w-full">
          {runComparisonData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              No pipeline run data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={runComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="accepted" name="Accepted Rows" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rejected" name="Quarantined Rejects" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Chart 2: Top Rejection Reasons Distribution */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 shadow-sm">
        <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-1">
          Top Quarantined Rejection Reasons
        </h4>
        <p className="text-[11px] text-slate-500 mb-4">Breakdown of schema and referential integrity anomalies</p>

        <div className="h-64 w-full">
          {reasonData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              No rejected records recorded (100% clean data)
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={reasonData} margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis
                  dataKey="reason"
                  type="category"
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  width={140}
                />
                <Tooltip content={<CustomTooltip />} />
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
