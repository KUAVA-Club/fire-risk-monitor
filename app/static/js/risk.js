export const RISK_LEVELS = [
  { min: 85, color: '#8B0000', label: 'EXTREME',    action: 'All channels + evacuation readiness' },
  { min: 70, color: '#ff4d4f', label: 'VERY HIGH',  action: 'SMS + dispatch prep' },
  { min: 50, color: '#ff6b35', label: 'HIGH',       action: 'Immediate email alert' },
  { min: 25, color: '#ffd166', label: 'MODERATE',   action: 'Daily digest + forecast review' },
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

export function styleFromBackend(data, fri) {
  return styleForLevel(data?.alert_level) || getRiskStyle(fri);
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
