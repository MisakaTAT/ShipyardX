import { openUrl } from '@tauri-apps/plugin-opener'
import { Server as ServerIcon, Stone, Settings, Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function siderNavButtonClass(active?: boolean, disabled?: boolean) {
  return cn(
    'h-10 w-full rounded-lg p-2.5 [&_svg]:size-[18px]',
    active &&
      'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-(--accent-text) hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] hover:text-(--accent-text)',
    !active && 'text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-base)',
    disabled && 'opacity-30',
  )
}

interface SiderProps {
  light: boolean
  activeView: 'workspace' | 'store'
  onChangeView: (view: 'workspace' | 'store') => void
  onToggleTheme: () => void
}

export default function Sider({ light, activeView, onChangeView, onToggleTheme }: SiderProps) {
  return (
    <nav
      className="flex w-14 shrink-0 flex-col items-center border-r border-border py-3"
      style={{ background: 'var(--bg-nav)' }}
    >
      <div className="flex w-full flex-col gap-1 px-2">
        <Button
          type="button"
          variant="ghost"
          title="服务器列表"
          className={siderNavButtonClass(activeView === 'workspace')}
          onClick={() => onChangeView('workspace')}
        >
          <ServerIcon size={18} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          title="应用商店"
          className={siderNavButtonClass(activeView === 'store')}
          onClick={() => onChangeView('store')}
        >
          <Stone size={18} />
        </Button>
      </div>

      <div className="flex-1" />

      <div className="flex w-full flex-col gap-1 px-2 pb-1">
        <Button
          type="button"
          variant="ghost"
          title="GitHub"
          className={siderNavButtonClass()}
          onClick={() => openUrl('https://github.com/MisakaTAT/ShipyardX').catch(() => {})}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </Button>
        <Button
          type="button"
          variant="ghost"
          title={light ? '切换深色' : '切换浅色'}
          className={siderNavButtonClass()}
          onClick={onToggleTheme}
        >
          {light ? <Moon size={18} /> : <Sun size={18} />}
        </Button>
        <Button type="button" variant="ghost" title="设置" className={siderNavButtonClass()} onClick={() => {}}>
          <Settings size={18} />
        </Button>
      </div>
    </nav>
  )
}
