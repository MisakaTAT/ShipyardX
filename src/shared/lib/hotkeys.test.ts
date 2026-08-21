import { describe, expect, it } from 'vitest'
import { formatHotkeyLabel } from '@/shared/lib/hotkeys'

function withPlatform(platform: string, run: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'platform')

  Object.defineProperty(navigator, 'platform', {
    configurable: true,
    value: platform,
  })

  try {
    run()
  } finally {
    if (descriptor) {
      Object.defineProperty(navigator, 'platform', descriptor)
    }
  }
}

describe('formatHotkeyLabel', () => {
  it('omits separators on macOS', () => {
    withPlatform('MacIntel', () => {
      expect(formatHotkeyLabel('Mod+Shift+B')).toBe('⌘⇧B')
    })
  })

  it('keeps separators on Windows', () => {
    withPlatform('Win32', () => {
      expect(formatHotkeyLabel('Ctrl+Shift+B')).toBe('Shift+Ctrl+B')
    })
  })
})
