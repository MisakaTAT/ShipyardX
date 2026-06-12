import type { ReactNode } from 'react'

export function SettingsPanelShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-8 py-7">{children}</div>
}

export function SettingsPanelHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="border-b border-border/70 pb-4">
      <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}

export function SettingsActionRow({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <div className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div>{action}</div>
    </div>
  )
}
