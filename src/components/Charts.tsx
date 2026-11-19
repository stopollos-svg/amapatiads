import { useMemo, useState } from 'react';
import { AppBreakdown, DailyMetric, FormatBreakdown } from '../types';

type TimeSeriesMetric = 'earnings' | 'ecpm' | 'impressions';

function formatCurrency(val: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

function formatCompact(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return String(val);
}

export function RevenueTimeSeriesChart({
  data,
  currency = 'USD',
}: {
  data: DailyMetric[];
  currency?: string;
}) {
  const [metric, setMetric] = useState<TimeSeriesMetric>('earnings');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const chartGeom = useMemo(() => {
    const width = 760;
    const height = 260;
    const padL = 56;
    const padR = 16;
    const padT = 18;
    const padB = 34;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    if (data.length === 0) {
      return { width, height, padL, padR, padT, padB, plotW, plotH, points: [], maxVal: 0, minVal: 0, linePath: '', areaPath: '' };
    }

    const values = data.map((d) =>
      metric === 'earnings' ? d.earnings : metric === 'ecpm' ? d.ecpm : d.impressions
    );
    const maxRaw = Math.max(...values, 1);
    const maxVal = maxRaw * 1.12;
    const minVal = 0;

    const points = data.map((d, i) => {
      const x =
        data.length === 1
          ? padL + plotW / 2
          : padL + (i / (data.length - 1)) * plotW;
      const val = values[i];
      const y = padT + plotH - ((val - minVal) / (maxVal - minVal || 1)) * plotH;
      return { x, y, val, item: d };
    });

    const linePath = points
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ');
    const areaPath =
      points.length > 0
        ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
        : '';

    return { width, height, padL, padR, padT, padB, plotW, plotH, points, maxVal, minVal, linePath, areaPath };
  }, [data, metric]);

  const activePoint =
    hoverIdx !== null && chartGeom.points[hoverIdx]
      ? chartGeom.points[hoverIdx]
      : chartGeom.points[chartGeom.points.length - 1] || null;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const val = chartGeom.maxVal * ratio;
    const y = chartGeom.padT + chartGeom.plotH * (1 - ratio);
    return {
      y,
      label:
        metric === 'impressions'
          ? formatCompact(Math.round(val))
          : formatCurrency(val, currency),
    };
  });

  const xLabelStep = Math.max(1, Math.floor(data.length / 6));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Daily Revenue & Delivery Trend
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Hover across dates to inspect daily earnings, eCPM, and impressions
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {([
            { key: 'earnings', label: 'Earnings' },
            { key: 'ecpm', label: 'eCPM' },
            { key: 'impressions', label: 'Impressions' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMetric(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                metric === tab.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activePoint && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs border-y border-slate-100 py-2.5 text-slate-600">
          <span className="font-mono font-medium text-slate-900 tabular-nums">
            {activePoint.item.date}
          </span>
          <span>
            Earnings:{' '}
            <strong className="font-mono text-slate-900 tabular-nums">
              {formatCurrency(activePoint.item.earnings, currency)}
            </strong>
          </span>
          <span>
            eCPM:{' '}
            <strong className="font-mono text-slate-900 tabular-nums">
              {formatCurrency(activePoint.item.ecpm, currency)}
            </strong>
          </span>
          <span>
            Impressions:{' '}
            <strong className="font-mono text-slate-900 tabular-nums">
              {activePoint.item.impressions.toLocaleString()}
            </strong>
          </span>
          <span>
            Match Rate:{' '}
            <strong className="font-mono text-teal-700 tabular-nums">
              {activePoint.item.matchRate.toFixed(2)}%
            </strong>
          </span>
        </div>
      )}

      {data.length === 0 ? (
        <div className="h-60 flex items-center justify-center text-sm text-slate-500">
          No daily metrics available for this date range.
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${chartGeom.width} ${chartGeom.height}`}
            className="w-full h-auto min-w-[540px] select-none"
            onMouseLeave={() => setHoverIdx(null)}
          >
            <defs>
              <linearGradient id="adverifyAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0F766E" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#0F766E" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {yTicks.map((t, idx) => (
              <g key={idx}>
                <line
                  x1={chartGeom.padL}
                  y1={t.y}
                  x2={chartGeom.width - chartGeom.padR}
                  y2={t.y}
                  stroke="#E2E8F0"
                  strokeWidth="1"
                  strokeDasharray={idx === 0 ? undefined : '3 3'}
                />
                <text
                  x={chartGeom.padL - 8}
                  y={t.y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[10px] font-mono tabular-nums"
                >
                  {t.label}
                </text>
              </g>
            ))}

            {chartGeom.areaPath && (
              <path d={chartGeom.areaPath} fill="url(#adverifyAreaGrad)" />
            )}
            {chartGeom.linePath && (
              <path
                d={chartGeom.linePath}
                fill="none"
                stroke="#0F766E"
                strokeWidth="2.25"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {chartGeom.points.map((pt, idx) => {
              const showLabel = idx % xLabelStep === 0 || idx === chartGeom.points.length - 1;
              const isActive = hoverIdx === idx;
              return (
                <g key={pt.item.date}>
                  {showLabel && (
                    <text
                      x={pt.x}
                      y={chartGeom.height - 10}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] font-mono tabular-nums"
                    >
                      {pt.item.date.slice(5)}
                    </text>
                  )}
                  {isActive && (
                    <line
                      x1={pt.x}
                      y1={chartGeom.padT}
                      x2={pt.x}
                      y2={chartGeom.padT + chartGeom.plotH}
                      stroke="#94A3B8"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                  )}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isActive ? 5 : 2.5}
                    className={isActive ? 'fill-teal-700 stroke-white' : 'fill-teal-700'}
                    strokeWidth={isActive ? 2 : 0}
                  />
                  <rect
                    x={pt.x - chartGeom.plotW / Math.max(chartGeom.points.length * 2, 2)}
                    y={chartGeom.padT}
                    width={chartGeom.plotW / Math.max(chartGeom.points.length, 1)}
                    height={chartGeom.plotH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(idx)}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

export function AppRevenueBarChart({
  apps,
  currency = 'USD',
}: {
  apps: AppBreakdown[];
  currency?: string;
}) {
  const maxEarnings = Math.max(...apps.map((a) => a.earnings), 1);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900">
          Revenue Contribution by App
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Comparative earnings, eCPM, and match rate across active apps
        </p>
      </div>

      {apps.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">
          No per-app breakdown available yet.
        </p>
      ) : (
        <div className="space-y-4">
          {apps.map((app) => {
            const pct = Math.max(4, (app.earnings / maxEarnings) * 100);
            return (
              <div key={app.admobAppId + app.appName} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900 truncate">
                      {app.appName}
                    </span>
                    <span className="text-xs text-slate-500 ml-2">
                      {app.platform} · eCPM {formatCurrency(app.ecpm, currency)} · Match {app.matchRate.toFixed(1)}%
                    </span>
                  </div>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                    {formatCurrency(app.earnings, currency)}
                  </span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 rounded-md overflow-hidden">
                  <div
                    className="h-full bg-teal-700 rounded-md transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const DONUT_COLORS = ['#0F766E', '#1E293B', '#0284C7', '#D97706', '#64748B'];

export function AdFormatDonutChart({
  formats,
  currency = 'USD',
}: {
  formats: FormatBreakdown[];
  currency?: string;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const total = formats.reduce((acc, f) => acc + f.earnings, 0);

  const segments = useMemo(() => {
    const r = 56;
    const c = 2 * Math.PI * r;
    let offset = 0;
    return formats.map((f, idx) => {
      const ratio = total > 0 ? f.earnings / total : 0;
      const dash = ratio * c;
      const seg = {
        ...f,
        color: DONUT_COLORS[idx % DONUT_COLORS.length],
        dasharray: `${dash.toFixed(2)} ${(c - dash).toFixed(2)}`,
        dashoffset: -offset,
      };
      offset += dash;
      return seg;
    });
  }, [formats, total]);

  const focused = activeIdx !== null ? segments[activeIdx] : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900">
          Ad Format Revenue Mix
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Share of earnings and effective CPM by ad placement format
        </p>
      </div>

      {formats.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">
          No format breakdown available yet.
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-40 h-40 shrink-0">
            <svg viewBox="0 0 144 144" className="w-full h-full -rotate-90">
              <circle
                cx="72"
                cy="72"
                r="56"
                fill="none"
                stroke="#F1F5F9"
                strokeWidth="18"
              />
              {segments.map((seg, idx) => (
                <circle
                  key={seg.format}
                  cx="72"
                  cy="72"
                  r="56"
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={activeIdx === idx ? 22 : 18}
                  strokeDasharray={seg.dasharray}
                  strokeDashoffset={seg.dashoffset}
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onMouseLeave={() => setActiveIdx(null)}
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
              <span className="text-[11px] text-slate-500 truncate max-w-full">
                {focused ? focused.format : 'Total'}
              </span>
              <span className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
                {formatCurrency(focused ? focused.earnings : total, currency)}
              </span>
            </div>
          </div>

          <div className="flex-1 w-full divide-y divide-slate-100">
            {segments.map((seg, idx) => (
              <div
                key={seg.format}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseLeave={() => setActiveIdx(null)}
                className={`flex items-center justify-between gap-3 py-2 text-xs transition-colors ${
                  activeIdx === idx ? 'bg-slate-50 px-2 rounded-md' : ''
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="font-medium text-slate-900 truncate">
                    {seg.format}
                  </span>
                </div>
                <div className="flex items-center gap-4 font-mono tabular-nums text-slate-600 shrink-0">
                  <span>{seg.share.toFixed(1)}%</span>
                  <span>{formatCurrency(seg.ecpm, currency)} eCPM</span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(seg.earnings, currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
