import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { appLogDir } from '@tauri-apps/api/path'
import { openPath } from '@tauri-apps/plugin-opener'
import { Bug, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { useAppSettings } from '@/app/settings-store'
import { commands } from '@/types/app-bindings'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import { getErrorDescription, getErrorMessage } from '@/shared/lib/errors'
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
        ) : activeSection === 'debug' ? (
          <DebugSettingsPanel />
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
      <SettingsPanelHeader eyebrow="Application" title="应用" description="应用级设置。" />
    </div>
  )
}

function DebugSettingsPanel() {
  const [pendingAction, setPendingAction] = useState<'devtools' | 'logs' | null>(null)

  const handleOpenDevtools = async () => {
    setPendingAction('devtools')
    try {
      await invoke('open_devtools')
      toast.success('已打开 DevTools')
    } catch (error) {
      toast.error(getErrorMessage(error, '打开 DevTools 失败'), {
        description: getErrorDescription(error, '打开 DevTools 失败'),
      })
    } finally {
      setPendingAction(null)
    }
  }

  const handleOpenLogDir = async () => {
    setPendingAction('logs')
    try {
      const logDir = await appLogDir()
      await openPath(logDir)
      toast.success('已打开日志目录', {
        description: logDir,
      })
    } catch (error) {
      toast.error(getErrorMessage(error, '打开日志目录失败'), {
        description: getErrorDescription(error, '打开日志目录失败'),
      })
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-8 py-7">
      <SettingsPanelHeader
        eyebrow="Debug"
        title="调试"
        description="调试入口会作用于当前桌面端实例，并用于定位界面状态与后端日志。"
      />

      <div className="divide-y divide-border/70">
        <SettingsActionRow
          title="开发者工具"
          description="打开当前主窗口的开发者工具"
          action={
            <Button
              variant="outline"
              className="w-full max-w-xs justify-center"
              onClick={() => void handleOpenDevtools()}
              disabled={pendingAction !== null}
            >
              <Bug className="size-4" />
              <span>{pendingAction === 'devtools' ? '正在打开…' : '打开开发者工具'}</span>
            </Button>
          }
        />

        <SettingsActionRow
          title="日志目录"
          description="打开当前应用的日志落盘目录"
          action={
            <Button
              variant="outline"
              className="w-full max-w-xs justify-center"
              onClick={() => void handleOpenLogDir()}
              disabled={pendingAction !== null}
            >
              <FolderOpen className="size-4" />
              <span>{pendingAction === 'logs' ? '正在打开…' : '打开日志目录'}</span>
            </Button>
          }
        />
      </div>
    </div>
  )
}

function SettingsPanelHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="border-b border-border/70 pb-4">
      <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function SettingsActionRow({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div>{action}</div>
    </div>
  )
}
