import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';

const colors = ['#2f968d', '#1f7a7a', '#7cc9bf', '#247770', '#4fb0a6', '#66b8a8', '#89cfc4'];

function aggregate(rows, key) {
  const map = {};
  rows.forEach((r) => {
    const label = r[key] || 'N/A';
    map[label] = (map[label] || 0) + 1;
  });
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

export default function TalentPage({ rows, lang }) {
  const nationalityData = useMemo(() => aggregate(rows, 'Nationality'), [rows]);
  const educationData = useMemo(() => aggregate(rows, 'Education'), [rows]);
  const ageData = useMemo(() => {
    const groups = {
      '<25': 0,
      '25-34': 0,
      '35-44': 0,
      '45+': 0,
    };

    rows.forEach((r) => {
      const age = Number(r.Age);
      if (!Number.isFinite(age)) {
        return;
      }
      if (age < 25) groups['<25'] += 1;
      else if (age < 35) groups['25-34'] += 1;
      else if (age < 45) groups['35-44'] += 1;
      else groups['45+'] += 1;
    });

    return Object.entries(groups).map(([name, value]) => ({ name, value }));
  }, [rows]);

  return (
    <div className="page-card">
      <div className="page-header">
        <div>
          <h1>{lang === 'ar' ? 'نظرة على المواهب' : 'Talent Overview'}</h1>
          <p>{lang === 'ar' ? 'توزيعات أساسية تساعد في تخطيط القوى العاملة.' : 'Core workforce distributions for planning.'}</p>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h3>{lang === 'ar' ? 'توزيع الموظفين حسب الجنسية' : 'Nationality Distribution'}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={nationalityData} dataKey="value" nameKey="name" outerRadius={90} innerRadius={45}>
                {nationalityData.map((entry, index) => (
                  <Cell key={entry.name} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>{lang === 'ar' ? 'التوزيع حسب المستوى التعليمي' : 'Education Distribution'}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={educationData} dataKey="value" nameKey="name" outerRadius={95}>
                {educationData.map((entry, index) => (
                  <Cell key={entry.name} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-grid" style={{ gridTemplateColumns: '1fr', marginTop: 10 }}>
        <div className="chart-card">
          <h3>{lang === 'ar' ? 'التوزيع حسب الفئة العمرية' : 'Age Group Distribution'}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ageData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2eded" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#2f968d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
