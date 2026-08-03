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

export function formatDateTimeString(raw: string): string {
  const s = raw.trim()
  if (!s) return '-'
  const d = dayjs(s)
  return d.isValid() ? d.format(DISPLAY) : s
}

export function formatNowTime(date?: Date | number): string {
  return dayjs(date).format('HH:mm:ss')
}

export function formatRelativeTime(date: Date | number): string {
  return dayjs(date).fromNow()
}
