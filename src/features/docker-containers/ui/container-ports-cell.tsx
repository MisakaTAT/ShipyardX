import { ArrowRight } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'

interface ContainerPortsCellProps {
  ports: string
  maxVisible?: number
  className?: string
}

interface ParsedPortBinding {
  raw: string
  protocol: string
  source: string
  target?: string
}

function parsePortBinding(raw: string): ParsedPortBinding | null {
  const value = raw.trim()
  if (!value) return null

  const [left, right] = value.split('->')
  if (!left || !right) {
    const [containerPort, protocol] = value.split('/')
    if (!containerPort || !protocol) return null
    return {
      raw: value,
      protocol: protocol.trim().toUpperCase(),
      source: containerPort.trim(),
    }
  }

  const separator = left.lastIndexOf(':')
  if (separator === -1) return null

  const source = left.trim()
  const [containerPort, protocol] = right.split('/')

  if (!source || !containerPort || !protocol) return null

  return {
    raw: value,
    protocol: protocol.trim().toUpperCase(),
    source,
    target: containerPort.trim(),
  }
}

function PortBindingPill({ binding }: { binding: ParsedPortBinding }) {
  return (
    <div
      className={cn(
        'group flex min-w-0 items-center gap-1 rounded-md border border-border/70 bg-muted/55 px-1.5 py-0.75',
        'transition-colors hover:border-sky-500/30 hover:from-sky-500/6 hover:to-transparent'
      )}
      title={binding.raw}
    >
      <span className="rounded-sm bg-sky-500/10 px-1 py-0.5 text-[8px] font-semibold tracking-[0.12em] text-sky-700 dark:text-sky-300">
        {binding.protocol}
      </span>
      {binding.target ? (
        <div className="flex min-w-0 items-center gap-0.5 font-mono text-[10px] text-foreground">
          <span className="truncate font-semibold">{binding.source}</span>
          <ArrowRight className="size-2 shrink-0 text-muted-foreground/80" />
          <span className="truncate text-muted-foreground">{binding.target}</span>
        </div>
      ) : (
        <div className="min-w-0 font-mono text-[10px] text-muted-foreground">
          <span className="truncate">{binding.source}</span>
        </div>
      )}
    </div>
  )
}

function MorePortsPopover({ bindings }: { bindings: ParsedPortBinding[] }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              'inline-flex items-center rounded-md border border-dashed border-border bg-muted/50 px-1.5 py-0.75 text-[9px] font-medium text-muted-foreground',
              'transition-colors hover:border-sky-500/30 hover:bg-sky-500/8 hover:text-foreground'
            )}
          />
        }
      >
        +{bindings.length}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-64 p-2">
        <div className="mb-1 px-0.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          More Ports
        </div>
        <div className="flex flex-col gap-1">
          {bindings.map((binding) => (
            <PortBindingPill
              key={`${binding.source}-${binding.target ?? 'none'}-${binding.protocol}`}
              binding={binding}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ContainerPortsCell({ ports, maxVisible = 2, className }: ContainerPortsCellProps) {
  const bindings = ports
    .split(',')
    .map(parsePortBinding)
    .filter((item): item is ParsedPortBinding => item !== null)

  if (bindings.length === 0) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  const visible = bindings.slice(0, maxVisible)
  const hidden = bindings.slice(maxVisible)

  return (
    <div className={cn('flex min-w-0 flex-wrap gap-1', className)} title={ports}>
      {visible.map((binding) => (
        <PortBindingPill key={`${binding.source}-${binding.target ?? 'none'}-${binding.protocol}`} binding={binding} />
      ))}
      {hidden.length > 0 ? <MorePortsPopover bindings={hidden} /> : null}
    </div>
  )
}
