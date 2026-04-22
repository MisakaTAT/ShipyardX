import { cn } from '@/shared/lib/utils'

export function WarnIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
      <path
        fillRule="evenodd"
        d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function TrafficRow({ label, value, tone }: { label: 'TX' | 'RX'; value: string; tone: 'tx' | 'rx' }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'inline-flex w-5 justify-center rounded font-sans text-[10px] font-medium',
          tone === 'tx' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-sky-500/15 text-sky-400'
        )}
      >
        {label}
      </span>
      <span>{value}</span>
    </div>
  )
}
