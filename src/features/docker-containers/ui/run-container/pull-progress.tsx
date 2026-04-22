import { useEffect, useRef } from 'react'
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import type { StepState } from '@/features/docker-containers/ui/run-container/use-run-container'

export interface ProgressStep {
  status: StepState
  title: string
  detail?: string
}

interface PullProgressProps {
  steps: ProgressStep[]
  pullLines: string[]
  showPullLog: boolean
  error: string | null
}

const StepIcon = ({ status }: { status: StepState }) => {
  if (status === 'done') return <CheckCircle2 className="size-5 shrink-0 text-green-500" />
  if (status === 'error') return <XCircle className="size-5 shrink-0 text-red-500" />
  if (status === 'active') return <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
  return <Circle className="size-5 shrink-0 text-muted-foreground" />
}

export function PullProgress({ steps, pullLines, showPullLog, error }: PullProgressProps) {
  const logEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showPullLog) return
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [pullLines, showPullLog])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-3">
            <StepIcon status={step.status} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{step.title}</p>
              {step.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{step.detail}</p> : null}
            </div>
          </div>
        ))}
      </div>

      {showPullLog ? (
        <div className="flex max-h-[320px] min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-muted">
          <div className="min-h-[120px] flex-1 overflow-auto bg-background p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {pullLines.join('\n')}
            <div ref={logEndRef} />
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}
