export async function fetchFireData(lat, lon) {
  const r = await fetch(`/fire/data?lat=${lat}&lon=${lon}`);
  if (!r.ok) throw new Error(`fire/data failed: ${r.status}`);
  return r.json();
}

export async function fetchDangerZones() {
  const r = await fetch('/fire/dangerZones');
  if (!r.ok) throw new Error(`fire/dangerZones failed: ${r.status}`);
  return r.json();
}

export async function fetchAlerts(since = '24h') {
  const r = await fetch(`/fire/alerts?since=${encodeURIComponent(since)}`);
  if (!r.ok) throw new Error(`fire/alerts failed: ${r.status}`);
  return r.json();
}
