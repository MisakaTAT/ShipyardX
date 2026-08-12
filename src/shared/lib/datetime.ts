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
