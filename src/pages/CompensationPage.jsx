import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency, formatNumber } from '../utils/format';

const barColors = ['#2f968d', '#1f7a7a', '#4fb0a6', '#7cc9bf', '#247770', '#59b5ad'];

export default function CompensationPage({ rows, lang }) {
  const totals = useMemo(() => {
    const totalGross = rows.reduce((sum, r) => sum + (Number(r.GrossCashMonthly) || 0), 0);
    const totalAllow = rows.reduce((sum, r) => sum + (Number(r.TotalCashAllowances) || 0), 0);
    const avg = rows.length ? totalGross / rows.length : 0;
    return { totalGross, totalAllow, avg };
  }, [rows]);

  const topSalaries = useMemo(() => {
    return [...rows]
      .sort((a, b) => (Number(b.GrossCashMonthly) || 0) - (Number(a.GrossCashMonthly) || 0))
      .slice(0, 10)
      .map((r) => ({
        name: r.Name,
        gross: Number(r.GrossCashMonthly) || 0,
      }));
  }, [rows]);

  const byProfession = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      const key = r.Profession || 'N/A';
      if (!map[key]) {
        map[key] = { profession: key, basic: 0, allowances: 0, count: 0 };
      }
      map[key].basic += Number(r.BasicSalary) || 0;
      map[key].allowances += Number(r.TotalCashAllowances) || 0;
      map[key].count += 1;
    });

    return Object.values(map)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((x) => ({
        profession: x.profession,
        basic: Math.round(x.basic),
        allowances: Math.round(x.allowances),
      }));
  }, [rows]);

  const salaryBands = useMemo(() => {
    const bands = {
      '0-2000': 0,
      '2000-4000': 0,
      '4000-6000': 0,
      '6000-8000': 0,
      '8000+': 0,
    };

    rows.forEach((r) => {
      const gross = Number(r.GrossCashMonthly) || 0;
      if (gross < 2000) bands['0-2000'] += 1;
      else if (gross < 4000) bands['2000-4000'] += 1;
      else if (gross < 6000) bands['4000-6000'] += 1;
      else if (gross < 8000) bands['6000-8000'] += 1;
      else bands['8000+'] += 1;
    });

    return Object.entries(bands).map(([name, value]) => ({ name, value }));
  }, [rows]);

  return (
    <div className="page-card">
      <div className="page-header">
        <div>
          <h1>{lang === 'ar' ? 'البدلات والرواتب' : 'Compensation'}</h1>
          <p>{lang === 'ar' ? 'تحليل الرواتب الأساسية والبدلات وإجمالي الرواتب الشهرية.' : 'Salary and allowances analytics.'}</p>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-top">{lang === 'ar' ? 'إجمالي الرواتب الشهرية' : 'Total Monthly Gross'}</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{formatCurrency(totals.totalGross)}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">{lang === 'ar' ? 'متوسط الراتب' : 'Average Salary'}</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{formatCurrency(totals.avg)}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">{lang === 'ar' ? 'إجمالي البدلات' : 'Total Allowances'}</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{formatCurrency(totals.totalAllow)}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">{lang === 'ar' ? 'عدد السجلات' : 'Records'}</div>
          <div className="kpi-value">{formatNumber(rows.length)}</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h3>{lang === 'ar' ? 'أعلى 10 موظفين راتبًا' : 'Top 10 Salaries'}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topSalaries} layout="vertical" margin={{ left: 8, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2eded" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={130} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="gross" radius={[8, 8, 8, 8]}>
                {topSalaries.map((item, idx) => (
                  <Cell key={item.name} fill={barColors[idx % barColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>{lang === 'ar' ? 'الراتب الأساسي مقابل البدلات حسب المهنة' : 'Basic vs Allowances by Profession'}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byProfession}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2eded" />
              <XAxis dataKey="profession" />
              <YAxis />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend />
              <Bar dataKey="basic" fill="#1f7a7a" radius={[8, 8, 0, 0]} />
              <Bar dataKey="allowances" fill="#4fb0a6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-grid" style={{ gridTemplateColumns: '1fr', marginTop: 10 }}>
        <div className="chart-card">
          <h3>{lang === 'ar' ? 'توزيع الرواتب حسب الشرائح' : 'Salary Bands Distribution'}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={salaryBands}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2eded" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#2f968d" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
