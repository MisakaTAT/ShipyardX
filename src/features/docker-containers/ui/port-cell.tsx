function parsePorts(ports: string): string[] {
  return ports
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function PortCell({ ports }: { ports: string }) {
  const list = parsePorts(ports)
  if (list.length === 0) return <span>—</span>
  const visible = list.slice(0, 2)
  const hiddenCount = list.length - visible.length

  return (
    <div className="flex flex-wrap gap-1" title={ports}>
      {visible.map((port) => (
        <span
          key={port}
          className="inline-block max-w-[200px] truncate rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          {port}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="inline-block rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          +{hiddenCount}
        </span>
      ) : null}
    </div>
  )
}
