import { useEffect, useState } from 'react'

import { cn } from '@/shared/lib/utils'

export interface KeepAliveProps {
  show: boolean
  children: React.ReactNode
  className?: string
  lazy?: boolean
}

export function KeepAlive({ show, children, className, lazy = false }: KeepAliveProps) {
  const [hasMounted, setHasMounted] = useState(() => !lazy || show)

  useEffect(() => {
    if (show) setHasMounted(true)
  }, [show])

  if (lazy && !hasMounted) return null

  return (
    <div className={cn(className, !show && 'hidden')} aria-hidden={!show}>
      {children}
    </div>
  )
}
