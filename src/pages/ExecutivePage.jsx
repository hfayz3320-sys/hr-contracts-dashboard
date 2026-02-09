import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber, monthKey, monthLabel } from '../utils/format';

const colors = ['#2f968d', '#1f7a7a', '#4fb0a6', '#7cc9bf', '#247770'];

export default function ExecutivePage({ rows, lang, t }) {
  const kpis = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.ContractStatus === 'Active').length;
    const expired = rows.filter((r) => r.ContractStatus === 'Expired').length;
    const exp30 = rows.filter((r) => r.ContractDaysRemaining >= 0 && r.ContractDaysRemaining <= 30).length;
    return { total, active, expired, exp30 };
  }, [rows]);

  const monthlySeries = useMemo(() => {
    const map = {};
    rows.forEach((row) => {
      const key = monthKey(row.StartDate || row.JoiningDate);
      if (!key) {
        return;
      }
      map[key] = (map[key] || 0) + 1;
    });

    return Object.keys(map)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => ({
        month: monthLabel(k, lang),
        headcount: map[k],
      }));
  }, [rows, lang]);

  const topProfessions = useMemo(() => {
    const map = {};
    rows.forEach((row) => {
      map[row.Profession || 'N/A'] = (map[row.Profession || 'N/A'] || 0) + 1;
    });

    return Object.entries(map)
      .map(([profession, value]) => ({ profession, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [rows]);

  return (
    <div className="page-card">
      <div className="page-header">
        <div>
          <h1>{lang === 'ar' ? 'الملخص التنفيذي' : 'Executive Summary'}</h1>
          <p>{t(lang, 'overviewHint')}</p>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-top"><span>{t(lang, 'totalEmployees')}</span></div>
          <div className="kpi-value">{formatNumber(kpis.total)}</div>
        </div>

        <div className="kpi-card kpi-success">
          <div className="kpi-top"><span>{t(lang, 'activeContracts')}</span></div>
          <div className="kpi-value">{formatNumber(kpis.active)}</div>
        </div>

        <div className="kpi-card kpi-danger">
          <div className="kpi-top"><span>{t(lang, 'expiredContracts')}</span></div>
          <div className="kpi-value">{formatNumber(kpis.expired)}</div>
        </div>

        <div className="kpi-card kpi-warn">
          <div className="kpi-top"><span>{t(lang, 'expiring30')}</span></div>
          <div className="kpi-value">{formatNumber(kpis.exp30)}</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h3>{lang === 'ar' ? 'عدد الموظفين حسب الشهر' : 'Headcount by Month'}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthlySeries} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2eded" />
              <XAxis dataKey="month" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="headcount" stroke="#1f7a7a" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>{lang === 'ar' ? 'أعلى 5 مهن' : 'Top 5 Professions'}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topProfessions} layout="vertical" margin={{ top: 8, right: 10, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2eded" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis dataKey="profession" type="category" width={120} />
              <Tooltip />
              <Bar dataKey="value" radius={[8, 8, 8, 8]}>
                {topProfessions.map((item, idx) => (
                  <Cell key={item.profession} fill={colors[idx % colors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
