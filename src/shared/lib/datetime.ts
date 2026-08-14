import dayjs from 'dayjs'

const DISPLAY = 'YYYY/MM/DD HH:mm:ss'

export function formatDateTimeString(raw: string): string {
  const s = raw.trim()
  if (!s) return '-'
  const d = dayjs(s)
  return d.isValid() ? d.format(DISPLAY) : s
}

export function formatNowTime(date?: Date | number): string {
  return dayjs(date).format('HH:mm:ss')
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.348],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
]

export function formatRelativeTime(atMs: number, locale: string, now = Date.now()): string {
  const elapsedSec = (atMs - now) / 1000
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  let value = elapsedSec
  for (const [unit, perNext] of RELATIVE_UNITS) {
    if (Math.abs(value) < perNext) return formatter.format(Math.round(value), unit)
    value /= perNext
  }
  return formatter.format(Math.round(value), 'year')
}
