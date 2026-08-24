import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type TerminalCursorStyle, type TerminalFrontend, type TerminalThemeName } from '@/app/settings-store'
import { SettingsActionRow, SettingsPanelShell, SettingsResetRow } from '@/pages/settings/settings-panel-shell'
import { XTERM_THEME_MAP } from '@/themes/xtermjs'
import { XTERM_THEME_NAMES } from '@/themes/xtermjs/names'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/shared/ui/combobox'
import { Switch } from '@/shared/ui/switch'

const TERMINAL_FRONTEND_OPTIONS: Array<{ value: TerminalFrontend; label: string }> = [
  { value: 'xterm-webgl', label: 'xterm (WebGL)' },
  { value: 'xterm-canvas', label: 'xterm (Canvas)' },
]

const CURSOR_STYLE_OPTIONS = [
  { value: 'block', labelKey: 'ui.settings.terminal.cursorStyle.block' },
  { value: 'underline', labelKey: 'ui.settings.terminal.cursorStyle.underline' },
  { value: 'bar', labelKey: 'ui.settings.terminal.cursorStyle.bar' },
] as const satisfies ReadonlyArray<{ value: TerminalCursorStyle; labelKey: string }>

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
  onReset: () => void
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
  onReset,
}: TerminalSettingsPanelProps) {
  const { t } = useTranslation()
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
      <div className="divide-y divide-border/70">
        <SettingsActionRow
          title={t('ui.settings.terminal.frontend.title')}
          description={t('ui.settings.terminal.frontend.description')}
          action={
            <div className="w-full max-w-xs">
              <Select value={frontend} onValueChange={(value) => onFrontendChange(value as TerminalFrontend)}>
                <SelectTrigger className="w-full">
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
          title={t('ui.settings.terminal.ligatures.title')}
          description={t('ui.settings.terminal.ligatures.description')}
          action={
            <label className="flex">
              <Switch checked={ligatures} onCheckedChange={onLigaturesChange} />
            </label>
          }
        />

        <SettingsActionRow
          title={t('ui.settings.terminal.theme.title')}
          description={t('ui.settings.terminal.theme.description')}
          action={
            <div className="w-full max-w-xs">
              <Combobox
                items={XTERM_THEME_NAMES}
                value={theme}
                onValueChange={(value) => {
                  if (value) onThemeChange(value as TerminalThemeName)
                }}
                itemToStringLabel={(value: TerminalThemeName) => formatThemeName(value)}
              >
                <ComboboxInput className="w-full" placeholder={t('ui.settings.terminal.theme.searchPlaceholder')} />
                <ComboboxContent>
                  <ComboboxEmpty>{t('ui.common.noMatch')}</ComboboxEmpty>
                  <ComboboxList>
                    {(option: TerminalThemeName) => {
                      const themeColors = XTERM_THEME_MAP[option]
                      return (
                        <ComboboxItem key={option} value={option}>
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
                        </ComboboxItem>
                      )
                    }}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
          }
        />

        <SettingsActionRow
          title={t('ui.settings.terminal.scrollback.title')}
          description={t('ui.settings.terminal.scrollback.description')}
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
              />
            </div>
          }
        />

        <SettingsActionRow
          title={t('ui.settings.terminal.fontFamily.title')}
          description={t('ui.settings.terminal.fontFamily.description')}
          action={
            <div className="w-full max-w-xs">
              <Combobox
                items={fontChoices}
                value={fontFamily}
                onValueChange={(value) => {
                  if (value) onFontFamilyChange(value)
                }}
              >
                <ComboboxInput
                  className="w-full"
                  placeholder={t('ui.settings.terminal.fontFamily.searchPlaceholder')}
                />
                <ComboboxContent>
                  <ComboboxEmpty>{t('ui.common.noMatch')}</ComboboxEmpty>
                  <ComboboxList>
                    {(option: string) => (
                      <ComboboxItem key={option} value={option}>
                        <span className="truncate">{option}</span>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
          }
        />

        <SettingsActionRow
          title={t('ui.settings.terminal.fontSize.title')}
          description={t('ui.settings.terminal.fontSize.description')}
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
              />
            </div>
          }
        />

        <SettingsActionRow
          title={t('ui.settings.terminal.cursorStyle.title')}
          description={t('ui.settings.terminal.cursorStyle.description')}
          action={
            <div className="w-full max-w-xs">
              <Select value={cursorStyle} onValueChange={(value) => onCursorStyleChange(value as TerminalCursorStyle)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(() => {
                      const option = CURSOR_STYLE_OPTIONS.find((item) => item.value === cursorStyle)
                      return option ? t(option.labelKey) : null
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CURSOR_STYLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />

        <SettingsActionRow
          title={t('ui.settings.terminal.cursorBlink.title')}
          description={t('ui.settings.terminal.cursorBlink.description')}
          action={
            <label className="flex">
              <Switch checked={cursorBlink} onCheckedChange={onCursorBlinkChange} />
            </label>
          }
        />

        <SettingsActionRow
          title={t('ui.settings.terminal.lineHeight.title')}
          description={t('ui.settings.terminal.lineHeight.description')}
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
              />
            </div>
          }
        />

        <SettingsResetRow description={t('ui.settings.terminal.resetDesc')} onReset={onReset} />
      </div>
    </SettingsPanelShell>
  )
}

function formatThemeName(name: string) {
  return name.split('_').join(' ')
}
