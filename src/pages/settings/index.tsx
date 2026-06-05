import { useEffect, useState } from 'react'
import { useAppSettings } from '@/app/settings-store'
import { commands } from '@/types/app-bindings'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import { SETTINGS_SECTIONS, type SettingsSectionKey } from '@/pages/settings/settings-sections'
import { TerminalSettingsPanel } from '@/pages/settings/terminal-settings-panel'

export default function SettingsPage() {
  const { settings, updateTerminalSettings, resetSettings } = useAppSettings()
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>('terminal')
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

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar/60 px-4 py-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground">设置</h1>
          <p className="mt-1 text-xs text-muted-foreground">调整本地界面偏好与终端行为。</p>
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

        <div className="mt-auto pt-4">
          <Button variant="outline" className="w-full justify-center" onClick={resetSettings}>
            恢复默认
          </Button>
        </div>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col overflow-auto bg-background">
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
          />
        ) : (
          <AppSettingsPanel />
        )}
      </section>
    </div>
  )
}

function AppSettingsPanel() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-8 py-7">
      <div className="border-b border-border/70 pb-4">
        <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">Application</p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">应用</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">应用级设置</p>
      </div>
    </div>
  )
}
