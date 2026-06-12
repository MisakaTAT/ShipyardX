import { useEffect, useState } from 'react'
import { useAppSettings } from '@/app/settings-store'
import { commands } from '@/types/app-bindings'
import { toast } from '@/shared/components/toast'
import { cn } from '@/shared/lib/utils'
import { AppSettingsPanel } from '@/pages/settings/app-settings-panel'
import { DebugSettingsPanel } from '@/pages/settings/debug-settings-panel'
import { SETTINGS_SECTIONS, type SettingsSectionKey } from '@/pages/settings/settings-sections'
import { TerminalSettingsPanel } from '@/pages/settings/terminal-settings-panel'

export default function SettingsPage() {
  const { settings, updateTerminalSettings, resetTerminalSettings } = useAppSettings()
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>('app')
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
    toast.success('终端设置已恢复默认')
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar/60 px-4 py-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground">设置</h1>
          <p className="mt-1 text-xs text-muted-foreground">调整应用偏好设置与行为</p>
        </div>

        <div className="mt-5 flex flex-col gap-1">
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
                <span>{section.title}</span>
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
        ) : activeSection === 'debug' ? (
          <DebugSettingsPanel />
        ) : (
          <AppSettingsPanel />
        )}
      </section>
    </div>
  )
}
