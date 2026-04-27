import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import updateLocale from 'dayjs/plugin/updateLocale'

dayjs.extend(relativeTime)
dayjs.extend(updateLocale)

dayjs.updateLocale('en', {
  relativeTime: {
    future: 'in %s',
    past: '%s ago',
    s: 'a few seconds',
    m: '1 minute',
    mm: '%d minutes',
    h: '1 hour',
    hh: '%d hours',
    d: '1 day',
    dd: '%d days',
    M: '1 month',
    MM: '%d months',
    y: '1 year',
    yy: '%d years',
  },
})

const DISPLAY = 'YYYY/MM/DD HH:mm:ss'
const DISPLAY_SHORT = 'MM/DD HH:mm'

export function formatUnixSeconds(ts: number): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return '-'
  const d = dayjs.unix(ts)
  return d.isValid() ? d.format(DISPLAY) : '-'
}

export function formatUnixSecondsShort(ts: number): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return '-'
  const d = dayjs.unix(ts)
  return d.isValid() ? d.format(DISPLAY_SHORT) : '-'
}

export function formatTimeAgo(input: number | string): string {
  if (input == null) return '-'
  const d =
    typeof input === 'number' ? (Number.isFinite(input) && input > 0 ? dayjs.unix(input) : null) : dayjs(input.trim())
  if (!d || !d.isValid()) return '-'
  const diffSec = Math.max(0, dayjs().diff(d, 'second'))
  if (diffSec < 60) return 'just now'
  return d.fromNow()
}

export function formatDateTimeString(raw: string): string {
  const s = raw.trim()
  if (!s) return '-'
  const d = dayjs(s)
  return d.isValid() ? d.format(DISPLAY) : s
}

export function formatUnixSecondsTime(ts: number): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return '-'
  const d = dayjs.unix(ts)
  return d.isValid() ? d.format('HH:mm:ss') : '-'
}

export function formatNowTime(date?: Date | number): string {
  return dayjs(date).format('HH:mm:ss')
}
