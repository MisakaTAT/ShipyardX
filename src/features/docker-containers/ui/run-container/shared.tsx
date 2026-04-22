import type { ReactNode } from 'react'
import { Checkbox } from '@/shared/ui/checkbox'

export const CHECK_ROW_CLASS = 'flex cursor-pointer items-start gap-2.5 text-left text-xs leading-snug text-foreground'

interface CheckRowProps {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  children: ReactNode
}

export function CheckRow({ checked, onCheckedChange, children }: CheckRowProps) {
  return (
    <label className={CHECK_ROW_CLASS}>
      <Checkbox checked={checked} onCheckedChange={(c) => onCheckedChange(c === true)} className="mt-0.5" />
      <span>{children}</span>
    </label>
  )
}
