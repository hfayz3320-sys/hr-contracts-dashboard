import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, Legend } from 'recharts';
import { formatDate, formatNumber } from '../utils/format';

const pieColors = ['#d9534f', '#ef8f34', '#2a9d65'];

export default function RiskPage({ rows, lang }) {
  const expiring = useMemo(() => {
    return rows
      .filter((r) => Number.isFinite(r.ContractDaysRemaining) && r.ContractDaysRemaining >= 0 && r.ContractDaysRemaining <= 90)
      .sort((a, b) => (a.ContractDaysRemaining || 0) - (b.ContractDaysRemaining || 0));
  }, [rows]);

  const riskCounters = useMemo(() => {
    const r30 = expiring.filter((r) => r.ContractDaysRemaining <= 30).length;
    const r60 = expiring.filter((r) => r.ContractDaysRemaining > 30 && r.ContractDaysRemaining <= 60).length;
    const r90 = expiring.filter((r) => r.ContractDaysRemaining > 60 && r.ContractDaysRemaining <= 90).length;
    return { r30, r60, r90 };
  }, [expiring]);

  const idStatusData = useMemo(() => {
    const today = new Date();
    const result = { expired: 0, expiringSoon: 0, valid: 0 };

    rows.forEach((r) => {
      if (!r.IDExpiryDate) {
        return;
      }
      const dt = new Date(r.IDExpiryDate);
      if (Number.isNaN(dt.getTime())) {
        return;
      }
      const diff = Math.floor((dt - today) / 86400000);
      if (diff < 0) result.expired += 1;
      else if (diff <= 30) result.expiringSoon += 1;
      else result.valid += 1;
    });

    return [
      { name: lang === 'ar' ? 'منتهية' : 'Expired', value: result.expired },
      { name: lang === 'ar' ? 'قريبة الانتهاء' : 'Expiring Soon', value: result.expiringSoon },
      { name: lang === 'ar' ? 'صالحة' : 'Valid', value: result.valid },
    ];
  }, [rows, lang]);

  const riskByProfession = useMemo(() => {
    const map = {};
    expiring.forEach((r) => {
      map[r.Profession || 'N/A'] = (map[r.Profession || 'N/A'] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [expiring]);

  return (
    <div className="page-card">
      <div className="page-header">
        <div>
          <h1>{lang === 'ar' ? 'مخاطر العقود' : 'Contract Risk'}</h1>
          <p>{lang === 'ar' ? 'رصد العقود القريبة من الانتهاء ومؤشرات مخاطر الهوية.' : 'Monitor expiring contracts and ID risk indicators.'}</p>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <div className="kpi-card kpi-danger">
          <div className="kpi-top">{lang === 'ar' ? 'خلال 30 يوم' : 'Within 30 Days'}</div>
          <div className="kpi-value">{formatNumber(riskCounters.r30)}</div>
        </div>
        <div className="kpi-card kpi-warn">
          <div className="kpi-top">{lang === 'ar' ? 'خلال 60 يوم' : 'Within 60 Days'}</div>
          <div className="kpi-value">{formatNumber(riskCounters.r60)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-top">{lang === 'ar' ? 'خلال 90 يوم' : 'Within 90 Days'}</div>
          <div className="kpi-value">{formatNumber(riskCounters.r90)}</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h3>{lang === 'ar' ? 'حالة الهوية' : 'ID Expiry Status'}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={idStatusData} dataKey="value" nameKey="name" outerRadius={95}>
                {idStatusData.map((item, idx) => (
                  <Cell key={item.name} fill={pieColors[idx % pieColors.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>{lang === 'ar' ? 'المخاطر حسب المهنة' : 'Risk by Profession'}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={riskByProfession} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2eded" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={130} />
              <Tooltip />
              <Bar dataKey="value" fill="#d9534f" radius={[8, 8, 8, 8]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card" style={{ marginTop: 12 }}>
        <h3>{lang === 'ar' ? 'العقود المنتهية قريبًا (90 يوم)' : 'Contracts Expiring in 90 Days'}</h3>
        <div className="table-wrap" style={{ maxHeight: 280 }}>
          <table className="table">
            <thead>
              <tr>
                <th>{lang === 'ar' ? 'الاسم' : 'Name'}</th>
                <th>{lang === 'ar' ? 'رقم الموظف' : 'Employee No'}</th>
                <th>{lang === 'ar' ? 'المهنة' : 'Profession'}</th>
                <th>{lang === 'ar' ? 'تاريخ النهاية' : 'End Date'}</th>
                <th>{lang === 'ar' ? 'الأيام المتبقية' : 'Days Left'}</th>
              </tr>
            </thead>
            <tbody>
              {expiring.slice(0, 150).map((r) => (
                <tr key={`${r.EmployeeNumber}-${r.ContractNumber}`}>
                  <td>{r.Name}</td>
                  <td>{r.EmployeeNumber}</td>
                  <td>{r.Profession}</td>
                  <td>{formatDate(r.EndDate)}</td>
                  <td>{formatNumber(r.ContractDaysRemaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
