interface ChipCellProps {
  items: string[]
  maxVisible?: number
}

export function ChipCell({ items, maxVisible = 2 }: ChipCellProps) {
  const list = items.map((s) => s.trim()).filter(Boolean)
  if (list.length === 0) {
    return <span className="font-mono text-xs text-muted-foreground">—</span>
  }
  const visible = list.slice(0, maxVisible)
  const hiddenCount = list.length - visible.length
  const full = list.join(', ')

  return (
    <div className="flex flex-wrap gap-1" title={full}>
      {visible.map((item, i) => (
        <span
          key={`${i}-${item}`}
          className="inline-block max-w-[200px] truncate rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          {item}
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
