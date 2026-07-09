import { describe, expect, it } from 'vitest'
import { installContextMenuGuard } from '@/app/init-context-menu-guard'

describe('installContextMenuGuard', () => {
  it('prevents the context menu in production', () => {
    const target = document.createElement('div')

    installContextMenuGuard({ isProd: true, target })

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    target.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('does not register a handler in development', () => {
    const target = document.createElement('div')

    installContextMenuGuard({ isProd: false, target })

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    target.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })
})
