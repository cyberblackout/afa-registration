import React from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { safeNumber } from '../../utils/number';
import Card from '../../components/Card';

const formatCurrency = (value: number) =>
  `GH₵ ${safeNumber(value).toLocaleString()}`;

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { color?: string; name?: string; value?: number | string }[]; label?: string | number }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload?.map((entry, idx) => (
        <p key={idx} className="chart-tooltip-value" style={{ color: entry.color }}>
          {entry.name === 'revenue' ? formatCurrency(Number(entry.value ?? 0)) : entry.value}
        </p>
      ))}
    </div>
  );
};

interface DashboardChartsProps {
  weeklyData: unknown[];
  isError: boolean;
  onRetry: () => void;
}

/**
 * Desktop-only revenue + registrations charts. Kept in a separate chunk so
 * the Recharts bundle (~110 KB gzip) is never downloaded on mobile — the
 * mobile dashboard uses the SVG Sparkline KPI carousel instead.
 */
const DashboardCharts: React.FC<DashboardChartsProps> = ({ weeklyData, isError, onRetry }) => {
  const data = weeklyData as { day?: string; revenue?: number; registrations?: number }[];

  const chartFallback = isError ? (
    <div
      style={{ height: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}
    >
      <p style={{ color: 'var(--m3-on-surface-variant)', margin: 0 }}>Failed to load chart</p>
      <button
        onClick={onRetry}
        style={{ background: 'none', border: 'none', color: 'var(--m3-primary)', cursor: 'pointer', font: 'var(--m3-font-label-lg)' }}
      >
        Retry
      </button>
    </div>
  ) : null;

  return (
    <>
      <Card className="chart-card">
        <div className="chart-card-header">
          <h3>Revenue Trend</h3>
          <span className="chart-period">Last 7 days</span>
        </div>
        {chartFallback}
        {!chartFallback && (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'var(--admin-text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--admin-text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={formatCurrency} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="revenue" stroke="#FFCB05" strokeWidth={3} dot={{ fill: '#FFCB05', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="chart-card">
        <div className="chart-card-header">
          <h3>Registrations Trend</h3>
          <span className="chart-period">Last 7 days</span>
        </div>
        {chartFallback}
        {!chartFallback && (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'var(--admin-text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--admin-text-secondary)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="registrations" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </>
  );
};

export default DashboardCharts;
