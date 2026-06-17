import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import type { StepState } from '@/features/docker-containers/ui/run-container/use-run-container'
import { ImagePullProgressPanel } from '@/features/docker-images/ui/image-pull-progress'
import type { ImagePullViewModel } from '@/features/docker-images/lib/image-pull-view'

export interface ProgressStep {
  status: StepState
  title: string
  detail?: string
}

interface PullProgressProps {
  steps: ProgressStep[]
  pullProgress: ImagePullViewModel | null
  showPullProgress: boolean
  error: string | null
}

const StepIcon = ({ status }: { status: StepState }) => {
  if (status === 'done') return <CheckCircle2 className="size-5 shrink-0 text-green-500" />
  if (status === 'error') return <XCircle className="size-5 shrink-0 text-red-500" />
  if (status === 'active') return <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
  return <Circle className="size-5 shrink-0 text-muted-foreground" />
}

export function PullProgress({ steps, pullProgress, showPullProgress, error }: PullProgressProps) {
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

      {showPullProgress ? <ImagePullProgressPanel progress={pullProgress} /> : null}

      {error ? (
        <p className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}
