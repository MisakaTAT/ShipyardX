const MODIFIER_ORDER = ['Mod', 'Shift', 'Alt'] as const

export function isMacPlatform() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
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

/**
 * 纯函数拿不到 t()，未设置时的文案由调用方传入；默认给一个语言无关的破折号。
 */
export function formatHotkeyLabel(value: string | null | undefined, unsetLabel = '—') {
  const normalized = normalizeHotkey(value)
  if (!normalized) return unsetLabel

  const symbols: Record<string, string> = isMacPlatform()
    ? { Mod: '\u2318', Meta: '\u2318', Ctrl: '\u2303', Alt: '\u2325', Shift: '\u21e7' }
    : { Mod: 'Ctrl', Meta: 'Win', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift' }
  const separator = isMacPlatform() ? '' : '+'

  return normalized
    .split('+')
    .map((token) => symbols[token] ?? token)
    .join(separator)
}

/**
 * 录制热键时，录制器和所有热键消费者都挂在 window 上，同一个事件两边都收得到 ——
 * preventDefault 只阻止默认行为，拦不住其他监听器。所以录制期间统一让匹配失效。
 */
let capturing = false

export function setHotkeyCapturing(value: boolean) {
  capturing = value
}

export function matchHotkey(event: KeyboardEvent, hotkey: string | null | undefined) {
  if (capturing) return false

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

  const platformIsMac = isMacPlatform()
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
  const platformIsMac = isMacPlatform()

  if (platformIsMac ? event.metaKey : event.ctrlKey) tokens.push('Mod')
  if (event.shiftKey) tokens.push('Shift')
  if (event.altKey) tokens.push('Alt')
  if (platformIsMac && event.ctrlKey) tokens.push('Ctrl')
  if (!platformIsMac && event.metaKey) tokens.push('Meta')
  tokens.push(key)

  return normalizeHotkey(tokens.join('+'))
}
