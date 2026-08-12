import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearch } from 'wouter'
import { useAppSettings } from '@/app/settings-store'
import { commands } from '@/types/app-bindings'
import { toast } from '@/shared/components/toast'
import { cn } from '@/shared/lib/utils'
import { GeneralSettingsPanel } from '@/pages/settings/app-settings-panel'
import { AboutSettingsPanel } from '@/pages/settings/about-settings-panel'
import { AppStoreSettingsPanel } from '@/pages/settings/appstore-settings-panel'
import { DebugSettingsPanel } from '@/pages/settings/debug-settings-panel'
import { HotkeySettingsPanel } from '@/pages/settings/hotkey-settings-panel'
import { SETTINGS_SECTIONS, type SettingsSectionKey } from '@/pages/settings/settings-sections'
import { TerminalSettingsPanel } from '@/pages/settings/terminal-settings-panel'

export default function SettingsPage() {
  const { t } = useTranslation()
  const { settings, updateTerminalSettings, resetTerminalSettings, updateAppStoreSettings } = useAppSettings()
  const search = useSearch()
  const initialSection = useMemo<SettingsSectionKey>(() => {
    const section = new URLSearchParams(search).get('section')
    return SETTINGS_SECTIONS.some((item) => item.key === section) ? (section as SettingsSectionKey) : 'general'
  }, [search])
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>(initialSection)
  const [terminalFontOptions, setTerminalFontOptions] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    void commands
      .listSystemFonts()
      .then((fonts) => {
        if (cancelled) return
        setTerminalFontOptions(fonts)
      })
      .catch(() => {
        if (cancelled) return
        setTerminalFontOptions([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleResetTerminalSettings = () => {
    resetTerminalSettings()
    toast.success(t('settings.terminal.toast.reset'))
  }

  useEffect(() => {
    setActiveSection(initialSection)
  }, [initialSection])

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar/60 p-3">
        <div className="flex flex-col gap-1">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon
            const active = section.key === activeSection
            return (
              <button
                key={section.key}
                type="button"
                className={cn(
                  'flex h-10 items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                onClick={() => setActiveSection(section.key)}
              >
                <Icon className="size-4 shrink-0" />
                <span>{t(section.titleKey)}</span>
              </button>
            )
          })}
        </div>
      </aside>

      <section className="flex min-h-0 flex-1 scrollbar-gutter-stable flex-col overflow-y-scroll bg-background">
        {activeSection === 'terminal' ? (
          <TerminalSettingsPanel
            frontend={settings.terminal.frontend}
            theme={settings.terminal.theme}
            scrollback={settings.terminal.scrollback}
            ligatures={settings.terminal.ligatures}
            fontFamily={settings.terminal.fontFamily}
            fontOptions={terminalFontOptions}
            fontSize={settings.terminal.fontSize}
            cursorStyle={settings.terminal.cursorStyle}
            cursorBlink={settings.terminal.cursorBlink}
            lineHeight={settings.terminal.lineHeight}
            onFrontendChange={(frontend) => updateTerminalSettings({ frontend })}
            onThemeChange={(theme) => updateTerminalSettings({ theme })}
            onScrollbackChange={(scrollback) => updateTerminalSettings({ scrollback })}
            onLigaturesChange={(ligatures) => updateTerminalSettings({ ligatures })}
            onFontFamilyChange={(fontFamily) => updateTerminalSettings({ fontFamily })}
            onFontSizeChange={(fontSize) => updateTerminalSettings({ fontSize })}
            onCursorStyleChange={(cursorStyle) => updateTerminalSettings({ cursorStyle })}
            onCursorBlinkChange={(cursorBlink) => updateTerminalSettings({ cursorBlink })}
            onLineHeightChange={(lineHeight) => updateTerminalSettings({ lineHeight })}
            onReset={handleResetTerminalSettings}
          />
        ) : activeSection === 'appstore' ? (
          <AppStoreSettingsPanel settings={settings.appstore} onSavedChange={updateAppStoreSettings} />
        ) : activeSection === 'about' ? (
          <AboutSettingsPanel />
        ) : activeSection === 'hotkeys' ? (
          <HotkeySettingsPanel />
        ) : activeSection === 'debug' ? (
          <DebugSettingsPanel />
        ) : (
          <GeneralSettingsPanel />
        )}
      </section>
    </div>
  )
}
