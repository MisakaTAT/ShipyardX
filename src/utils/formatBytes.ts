import prettyBytes from 'pretty-bytes'

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  return prettyBytes(bytes, { binary: true, maximumFractionDigits: 2 })
}

export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0 B/s'
  return `${prettyBytes(bytesPerSec, { binary: true, maximumFractionDigits: 1 })}/s`
}
