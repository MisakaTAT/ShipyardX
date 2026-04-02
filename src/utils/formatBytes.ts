import prettyBytes from 'pretty-bytes'

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  return prettyBytes(bytes, { binary: true, maximumFractionDigits: 2 })
}
