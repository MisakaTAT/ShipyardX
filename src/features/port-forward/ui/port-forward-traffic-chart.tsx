import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/shared/ui/chart'
import { formatNowTime } from '@/shared/lib/datetime'
import { cn } from '@/shared/lib/utils'
import { formatSpeed } from '@/features/port-forward/model/group-forwards'
import { TRAFFIC_CAPACITY, type TrafficSample } from '@/features/port-forward/lib/use-traffic-history'

interface PortForwardTrafficChartProps {
  samples: TrafficSample[]
  className?: string
}

export function PortForwardTrafficChart({ samples, className }: PortForwardTrafficChartProps) {
  const { t } = useTranslation()
  const gradientId = useId().replace(/:/g, '')

  const chartConfig = {
    tx: {
      label: t('ui.portForward.kpiTx'),
      theme: { light: 'var(--color-emerald-600)', dark: 'var(--color-emerald-400)' },
    },
    rx: {
      label: t('ui.portForward.kpiRx'),
      theme: { light: 'var(--color-sky-600)', dark: 'var(--color-sky-400)' },
    },
  } satisfies ChartConfig

  const { data, peak } = useMemo(() => {
    const padded: TrafficSample[] =
      samples.length >= TRAFFIC_CAPACITY
        ? samples
        : [...Array.from({ length: TRAFFIC_CAPACITY - samples.length }, () => ({ at: 0, tx: 0, rx: 0 })), ...samples]

    return {
      peak: padded.reduce((max, sample) => Math.max(max, sample.tx, sample.rx), 0),
      data: padded.map((sample) => ({
        label: sample.at > 0 ? formatNowTime(sample.at) : '',
        tx: sample.tx,
        rx: sample.rx,
      })),
    }
  }, [samples])

  return (
    <div className={cn('rounded-xl border border-border bg-card', className)}>
      <div className="flex h-8 items-center gap-3 px-3">
        <span className="text-xs font-medium text-muted-foreground">{t('ui.portForward.traffic')}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" aria-hidden />
          {t('ui.portForward.kpiTx')}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-sky-600 dark:bg-sky-400" aria-hidden />
          {t('ui.portForward.kpiRx')}
        </span>
      </div>

      <div className="relative px-1 pb-1">
        <ChartContainer config={chartConfig} className="aspect-auto h-20 w-full">
          <AreaChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`${gradientId}-tx`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-tx)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-tx)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id={`${gradientId}-rx`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-rx)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--color-rx)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" hide />
            <YAxis hide domain={[0, (max: number) => Math.max(max, 1)]} />

            <ChartTooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  formatter={(value, name) => (
                    <div className="flex w-full items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: `var(--color-${name})` }}
                      />
                      <span className="text-muted-foreground">
                        {chartConfig[name as keyof typeof chartConfig]?.label}
                      </span>
                      <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                        {formatSpeed(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />

            <Area
              dataKey="rx"
              type="monotone"
              stroke="var(--color-rx)"
              strokeWidth={1.5}
              fill={`url(#${gradientId}-rx)`}
              dot={false}
              activeDot={{ r: 2.5 }}
              isAnimationActive={false}
            />
            <Area
              dataKey="tx"
              type="monotone"
              stroke="var(--color-tx)"
              strokeWidth={1.5}
              fill={`url(#${gradientId}-tx)`}
              dot={false}
              activeDot={{ r: 2.5 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>

        {peak > 0 ? null : (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/60">
            {t('ui.portForward.trafficIdle')}
          </span>
        )}
      </div>
    </div>
  )
}
