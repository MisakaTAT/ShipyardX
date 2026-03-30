import dayjs from 'dayjs'

const DISPLAY = 'YYYY/MM/DD HH:mm:ss'

export function formatUnixSeconds(ts: number): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return '—'
  const d = dayjs.unix(ts)
  return d.isValid() ? d.format(DISPLAY) : '—'
}

export function formatDateTimeString(raw: string): string {
  const s = raw.trim()
  if (!s) return '—'
  const d = dayjs(s)
  return d.isValid() ? d.format(DISPLAY) : s
}
