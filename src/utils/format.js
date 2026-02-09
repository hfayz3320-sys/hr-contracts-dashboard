import dayjs from 'dayjs';

export const formatNumber = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

export const formatCurrency = (value) => Number(value || 0).toLocaleString('en-US', {
  style: 'currency',
  currency: 'SAR',
  maximumFractionDigits: 0,
});

export const formatDate = (value) => {
  if (!value) {
    return '-';
  }
  const date = dayjs(value);
  return date.isValid() ? date.format('YYYY-MM-DD') : '-';
};

export const monthKey = (value) => {
  if (!value) {
    return '';
  }
  const date = dayjs(value);
  return date.isValid() ? date.format('YYYY-MM') : '';
};

export const monthLabel = (key, lang = 'ar') => {
  if (!key) {
    return '';
  }
  const date = dayjs(`${key}-01`);
  if (!date.isValid()) {
    return key;
  }
  const formatter = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
    month: 'short',
    year: 'numeric',
  });
  return formatter.format(date.toDate());
};
