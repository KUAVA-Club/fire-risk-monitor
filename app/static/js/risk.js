// Thresholds follow the Canadian Forest Service FWI scale used by the
// backend's CFS fallback. The backend's percentile-based path is
// non-deterministic across calls, so the frontend stays the single
// source of truth for color → FRI mapping.
export const RISK_LEVELS = [
  { min: 49, color: '#8B0000', label: 'EXTREME',    action: 'All channels + evacuation readiness' },
  { min: 32, color: '#ff4d4f', label: 'VERY HIGH',  action: 'SMS + dispatch prep' },
  { min: 17, color: '#ff6b35', label: 'HIGH',       action: 'Immediate email alert' },
  { min: 8,  color: '#ffd166', label: 'MODERATE',   action: 'Daily digest + forecast review' },
  { min: 0,  color: '#4ade80', label: 'LOW',        action: 'Log only (review EOD)' },
];

const STYLE_BY_LABEL = {
  EXTREME:    { color: '#8B0000', label: 'EXTREME',    action: 'All channels + evacuation readiness' },
  VERY_HIGH:  { color: '#ff4d4f', label: 'VERY HIGH',  action: 'SMS + dispatch prep' },
  HIGH:       { color: '#ff6b35', label: 'HIGH',       action: 'Immediate email alert' },
  MODERATE:   { color: '#ffd166', label: 'MODERATE',   action: 'Daily digest + forecast review' },
  LOW:        { color: '#4ade80', label: 'LOW',        action: 'Log only (review EOD)' },
};

function normalizeLabel(level) {
  if (!level) return null;
  return String(level).trim().toUpperCase().replace(/\s+/g, '_');
}

export function styleForLevel(level) {
  const key = normalizeLabel(level);
  if (!key) return null;
  const s = STYLE_BY_LABEL[key];
  return s ? { ...s } : null;
}

export function getRiskStyle(fri) {
  if (fri == null || Number.isNaN(fri)) return { ...RISK_LEVELS[RISK_LEVELS.length - 1] };
  const found = RISK_LEVELS.find(l => fri >= l.min) || RISK_LEVELS[RISK_LEVELS.length - 1];
  return { ...found };
}

export function styleFromBackend(_data, fri) {
  // Intentionally ignore backend's alert_level — it drifts between
  // CFS-fallback and percentile thresholds on repeated calls for the
  // same point. FRI → color is deterministic on the frontend.
  return getRiskStyle(fri);
}

export function alertCssClass(level) {
  const key = normalizeLabel(level);
  if (!key) return '';
  return 'lvl-' + key.replace(/_/g, '');
}

const LEVEL_RANK = { EXTREME: 5, VERY_HIGH: 4, HIGH: 3, MODERATE: 2, LOW: 1 };

export function levelRank(level) {
  const key = normalizeLabel(level);
  return key ? (LEVEL_RANK[key] ?? 0) : 0;
}
