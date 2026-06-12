const MODIFIER_ORDER = ['Mod', 'Shift', 'Alt'] as const

type ModifierToken = (typeof MODIFIER_ORDER)[number] | 'Ctrl' | 'Meta'

const MODIFIER_LABELS: Record<ModifierToken, string> = {
  Mod: 'Mod',
  Shift: 'Shift',
  Alt: 'Alt',
  Ctrl: 'Ctrl',
  Meta: 'Cmd',
}

function normalizeKeyToken(token: string): string {
  const trimmed = token.trim()
  if (!trimmed) return ''
  const lower = trimmed.toLowerCase()
  if (lower === 'cmd' || lower === 'command' || lower === 'meta') return 'Meta'
  if (lower === 'ctrl' || lower === 'control') return 'Ctrl'
  if (lower === 'mod') return 'Mod'
  if (lower === 'alt' || lower === 'option') return 'Alt'
  if (lower === 'shift') return 'Shift'
  if (lower === 'esc') return 'Escape'
  if (lower === 'space') return 'Space'
  return trimmed.length === 1 ? trimmed.toUpperCase() : `${trimmed[0]?.toUpperCase() ?? ''}${trimmed.slice(1)}`
}

export function normalizeHotkey(value: unknown): string | null {
  if (value == null || value === false) return null
  if (typeof value !== 'string') return null

  const tokens = value
    .split('+')
    .map((token) => normalizeKeyToken(token))
    .filter(Boolean)

  if (!tokens.length) return null

  const modifiers: string[] = MODIFIER_ORDER.filter((modifier) => tokens.includes(modifier))
  const ctrlMeta = tokens.find((token) => token === 'Ctrl' || token === 'Meta')
  const mainKey = tokens.find(
    (token) => token !== 'Mod' && token !== 'Shift' && token !== 'Alt' && token !== 'Ctrl' && token !== 'Meta'
  )

  const ordered = [...modifiers]
  if (ctrlMeta) ordered.push(ctrlMeta)
  if (mainKey) ordered.push(mainKey)

  return ordered.length ? ordered.join('+') : null
}

export function formatHotkeyLabel(value: string | null | undefined) {
  if (!value) return '未设置'
  return value
    .split('+')
    .map((token) => {
      const normalized = normalizeKeyToken(token) as ModifierToken | string
      return normalized in MODIFIER_LABELS
        ? MODIFIER_LABELS[normalized as ModifierToken]
        : normalized === ' '
          ? 'Space'
          : normalized
    })
    .join(' + ')
}

export function matchHotkey(event: KeyboardEvent, hotkey: string | null | undefined) {
  const normalized = normalizeHotkey(hotkey)
  if (!normalized) return false

  const tokens = normalized.split('+')
  const mainKey = tokens[tokens.length - 1]
  const modifiers = new Set(tokens.slice(0, -1))
  const expectsMod = modifiers.has('Mod')
  const expectsShift = modifiers.has('Shift')
  const expectsAlt = modifiers.has('Alt')
  const expectsCtrl = modifiers.has('Ctrl')
  const expectsMeta = modifiers.has('Meta')

  const platformIsMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  const modPressed = platformIsMac ? event.metaKey : event.ctrlKey

  if (expectsMod !== modPressed) return false
  if (expectsShift !== event.shiftKey) return false
  if (expectsAlt !== event.altKey) return false

  const ctrlSatisfiedByMod = !platformIsMac && expectsMod
  const metaSatisfiedByMod = platformIsMac && expectsMod

  if (expectsCtrl && !event.ctrlKey) return false
  if (expectsMeta && !event.metaKey) return false
  if (!expectsCtrl && event.ctrlKey && !ctrlSatisfiedByMod) return false
  if (!expectsMeta && event.metaKey && !metaSatisfiedByMod) return false

  if (!mainKey) return true

  const eventKey = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key
  return normalizeKeyToken(eventKey) === normalizeKeyToken(mainKey)
}

export function hotkeyFromKeyboardEvent(event: KeyboardEvent): string | null {
  const key = normalizeKeyToken(event.key === ' ' ? 'Space' : event.key)
  if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return null

  const tokens: string[] = []
  const platformIsMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)

  if (platformIsMac ? event.metaKey : event.ctrlKey) tokens.push('Mod')
  if (event.shiftKey) tokens.push('Shift')
  if (event.altKey) tokens.push('Alt')
  if (platformIsMac && event.ctrlKey) tokens.push('Ctrl')
  if (!platformIsMac && event.metaKey) tokens.push('Meta')
  tokens.push(key)

  return normalizeHotkey(tokens.join('+'))
}
