import React from 'react';

function normalizeLabel(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function truncateChartLabel(value, maxLength = 18) {
  const label = normalizeLabel(value);
  if (!label) {
    return '';
  }

  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, Math.max(1, maxLength - 1)).trim()}...`;
}

export function createAxisTickRenderer({
  maxLength = 18,
  textAnchor = 'middle',
  dx = 0,
  dy = 0,
  fontSize = 12,
  direction = 'ltr',
} = {}) {
  return function AxisTick({ x = 0, y = 0, payload }) {
    const label = normalizeLabel(payload?.value);
    const displayLabel = truncateChartLabel(label, maxLength);

    return (
      <g transform={`translate(${x},${y})`}>
        <title>{label}</title>
        <text
          x={dx}
          y={dy}
          fill="#5f7c82"
          fontSize={fontSize}
          textAnchor={textAnchor}
          direction={direction}
        >
          {displayLabel}
        </text>
      </g>
    );
  };
}

export function createLegendFormatter({ maxLength = 18 } = {}) {
  return function legendFormatter(value) {
    const label = normalizeLabel(value);
    const displayLabel = truncateChartLabel(label, maxLength);

    return (
      <span title={label} style={{ display: 'inline-block', maxWidth: 180, verticalAlign: 'middle' }}>
        {displayLabel}
      </span>
    );
  };
}

export function getCategoryAxisWidth(data, key, options = {}) {
  const {
    min = 120,
    max = 220,
    characterWidth = 7,
  } = options;

  const longestLength = Math.max(
    0,
    ...(data || []).map((item) => normalizeLabel(item?.[key]).length)
  );

  return Math.min(max, Math.max(min, longestLength * characterWidth));
}
