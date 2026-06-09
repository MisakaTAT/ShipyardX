import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { type TerminalCursorStyle, type TerminalFrontend, type TerminalThemeName } from '@/app/settings-store'
import { SettingsActionRow, SettingsPanelHeader, SettingsPanelShell } from '@/pages/settings/settings-panel-shell'
import { XTERM_THEME_MAP, XTERM_THEME_NAMES } from '@/themes/xtermjs'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Switch } from '@/shared/ui/switch'

const TERMINAL_FRONTEND_OPTIONS: Array<{ value: TerminalFrontend; label: string }> = [
  { value: 'xterm-webgl', label: 'xterm (WebGL)' },
  { value: 'xterm-canvas', label: 'xterm (Canvas)' },
]

const CURSOR_STYLE_OPTIONS: Array<{ value: TerminalCursorStyle; label: string }> = [
  { value: 'block', label: '方块' },
  { value: 'underline', label: '下划线' },
  { value: 'bar', label: '竖线' },
]

const SETTINGS_CONTROL_CLASSNAME = 'h-8 rounded-lg border-border bg-card px-3 py-0 text-sm leading-none shadow-none'

const SETTINGS_TOGGLE_CLASSNAME = 'flex h-8 w-fit items-center gap-3'

interface TerminalSettingsPanelProps {
  frontend: TerminalFrontend
  theme: TerminalThemeName
  scrollback: number
  ligatures: boolean
  fontFamily: string
  fontOptions: string[]
  fontSize: number
  cursorStyle: TerminalCursorStyle
  cursorBlink: boolean
  lineHeight: number
  onFrontendChange: (value: TerminalFrontend) => void
  onThemeChange: (value: TerminalThemeName) => void
  onScrollbackChange: (value: number) => void
  onLigaturesChange: (value: boolean) => void
  onFontFamilyChange: (value: string) => void
  onFontSizeChange: (value: number) => void
  onCursorStyleChange: (value: TerminalCursorStyle) => void
  onCursorBlinkChange: (value: boolean) => void
  onLineHeightChange: (value: number) => void
}

export function TerminalSettingsPanel({
  frontend,
  theme,
  scrollback,
  ligatures,
  fontFamily,
  fontOptions,
  fontSize,
  cursorStyle,
  cursorBlink,
  lineHeight,
  onFrontendChange,
  onThemeChange,
  onScrollbackChange,
  onLigaturesChange,
  onFontFamilyChange,
  onFontSizeChange,
  onCursorStyleChange,
  onCursorBlinkChange,
  onLineHeightChange,
}: TerminalSettingsPanelProps) {
  const [scrollbackDraft, setScrollbackDraft] = useState(String(scrollback))
  const [fontSizeDraft, setFontSizeDraft] = useState(String(fontSize))
  const [lineHeightDraft, setLineHeightDraft] = useState(String(lineHeight))
  const fontChoices = Array.from(new Set([fontFamily, ...fontOptions]))

  useEffect(() => {
    setScrollbackDraft(String(scrollback))
  }, [scrollback])

  useEffect(() => {
    setFontSizeDraft(String(fontSize))
  }, [fontSize])

  useEffect(() => {
    setLineHeightDraft(String(lineHeight))
  }, [lineHeight])

  const commitScrollback = () => {
    const parsed = Number(scrollbackDraft)
    if (!Number.isFinite(parsed)) {
      setScrollbackDraft(String(scrollback))
      return
    }
    onScrollbackChange(parsed)
  }

  const commitFontSize = () => {
    const parsed = Number(fontSizeDraft)
    if (!Number.isFinite(parsed)) {
      setFontSizeDraft(String(fontSize))
      return
    }
    onFontSizeChange(parsed)
  }

  const commitLineHeight = () => {
    const parsed = Number(lineHeightDraft)
    if (!Number.isFinite(parsed)) {
      setLineHeightDraft(String(lineHeight))
      return
    }
    onLineHeightChange(parsed)
  }

  return (
    <SettingsPanelShell>
      <SettingsPanelHeader eyebrow="Terminal" title="终端" description="" />

      <div className="divide-y divide-border/70">
        <SettingsActionRow
          title="前端"
          description="切换终端渲染路径"
          action={
            <div className="w-full max-w-xs">
              <Select value={frontend} onValueChange={(value) => onFrontendChange(value as TerminalFrontend)}>
                <SelectTrigger className={`w-full ${SETTINGS_CONTROL_CLASSNAME}`}>
                  <SelectValue>
                    {TERMINAL_FRONTEND_OPTIONS.find((option) => option.value === frontend)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TERMINAL_FRONTEND_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />

        <SettingsActionRow
          title="启用连结字"
          description="为编程字体里的 ligatures 启用合字渲染"
          action={
            <label className={SETTINGS_TOGGLE_CLASSNAME}>
              <Switch checked={ligatures} onCheckedChange={onLigaturesChange} />
            </label>
          }
        />

        <SettingsActionRow
          title="配色"
          description="切换终端主题配色"
          action={
            <SearchablePicker<TerminalThemeName>
              value={theme}
              options={XTERM_THEME_NAMES}
              onChange={onThemeChange}
              renderValue={(option) => formatThemeName(option)}
              renderOption={(option) => {
                const themeColors = XTERM_THEME_MAP[option]
                return (
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex items-center gap-1">
                      {[themeColors.background, themeColors.foreground, themeColors.red, themeColors.blue].map(
                        (color, index) => (
                          <span
                            key={`${option}-${index}`}
                            className="size-3 rounded-full border border-black/10"
                            style={{ backgroundColor: color }}
                          />
                        )
                      )}
                    </div>
                    <span className="truncate">{formatThemeName(option)}</span>
                  </div>
                )
              }}
              placeholder="搜索配色"
            />
          }
        />

        <SettingsActionRow
          title="回滚"
          description="保存在缓冲区的行数"
          action={
            <div className="w-full max-w-xs">
              <Input
                type="number"
                inputMode="numeric"
                value={scrollbackDraft}
                onChange={(event) => setScrollbackDraft(event.target.value.replace(/[^\d]/g, ''))}
                onBlur={commitScrollback}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitScrollback()
                    event.currentTarget.blur()
                  }
                }}
                className={SETTINGS_CONTROL_CLASSNAME}
              />
            </div>
          }
        />

        <SettingsActionRow
          title="终端字体"
          description="设置终端使用的等宽字体"
          action={
            <SearchablePicker
              value={fontFamily}
              options={fontChoices}
              onChange={onFontFamilyChange}
              placeholder="搜索字体"
            />
          }
        />

        <SettingsActionRow
          title="字体大小"
          description="控制终端字符的显示尺寸"
          action={
            <div className="w-full max-w-xs">
              <Input
                type="number"
                inputMode="numeric"
                value={fontSizeDraft}
                onChange={(event) => setFontSizeDraft(event.target.value.replace(/[^\d]/g, ''))}
                onBlur={commitFontSize}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitFontSize()
                    event.currentTarget.blur()
                  }
                }}
                className={SETTINGS_CONTROL_CLASSNAME}
              />
            </div>
          }
        />

        <SettingsActionRow
          title="光标形状"
          description="设置终端光标的形态"
          action={
            <div className="w-full max-w-xs">
              <Select value={cursorStyle} onValueChange={(value) => onCursorStyleChange(value as TerminalCursorStyle)}>
                <SelectTrigger className={`w-full ${SETTINGS_CONTROL_CLASSNAME}`}>
                  <SelectValue>
                    {CURSOR_STYLE_OPTIONS.find((option) => option.value === cursorStyle)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CURSOR_STYLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />

        <SettingsActionRow
          title="光标闪烁"
          description="启用或关闭光标闪烁动画"
          action={
            <label className={SETTINGS_TOGGLE_CLASSNAME}>
              <Switch checked={cursorBlink} onCheckedChange={onCursorBlinkChange} />
            </label>
          }
        />

        <SettingsActionRow
          title="行间距"
          description="调整终端行高，影响整体纵向密度"
          action={
            <div className="w-full max-w-xs">
              <Input
                type="number"
                inputMode="decimal"
                value={lineHeightDraft}
                onChange={(event) => setLineHeightDraft(event.target.value.replace(/[^\d.]/g, ''))}
                onBlur={commitLineHeight}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitLineHeight()
                    event.currentTarget.blur()
                  }
                }}
                className={SETTINGS_CONTROL_CLASSNAME}
              />
            </div>
          }
        />
      </div>
    </SettingsPanelShell>
  )
}

function formatThemeName(name: string) {
  return name.split('_').join(' ')
}

function SearchablePicker<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  renderValue,
  renderOption,
}: {
  value: T
  options: T[]
  onChange: (value: T) => void
  placeholder: string
  renderValue?: (value: T) => ReactNode
  renderOption?: (value: T) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const filteredOptions = options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative w-full max-w-xs">
      <button
        type="button"
        className={`relative flex w-full items-center border border-input ${SETTINGS_CONTROL_CLASSNAME}`}
        onClick={() => {
          setOpen((current) => !current)
          setQuery('')
        }}
      >
        <span className="truncate pr-7 text-left">{renderValue ? renderValue(value) : value}</span>
        <ChevronDown className="absolute right-3 size-4 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <div className="border-b border-border p-1">
            <Input
              type="text"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder={placeholder}
              className="h-8 rounded-md border-border bg-card px-2.5 py-0 text-sm"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange(option)
                  setOpen(false)
                  setQuery('')
                }}
              >
                {renderOption ? renderOption(option) : <span className="truncate">{option}</span>}
              </button>
            ))}
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">没有匹配项</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
