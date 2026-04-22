import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/shared/ui/button'
import { siderNavButton } from '@/shared/styles/variants'

interface NavButtonProps extends Omit<ComponentProps<typeof Button>, 'variant' | 'size'> {
  active?: boolean
  children: ReactNode
}

export function NavButton({ active, className, children, ...rest }: NavButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={siderNavButton({ active: active ?? false }) + (className ? ' ' + className : '')}
      {...rest}
    >
      {children}
    </Button>
  )
}
