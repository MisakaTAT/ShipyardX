import type { MouseEvent } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useLocation } from 'wouter'
import { Moon, Settings, Sun } from 'lucide-react'
import { useTheme, useIsLightMode, runThemeTransition } from '@/app/theme'
import { PRIMARY_NAV } from '@/layouts/sider/nav-config'
import { NavButton } from '@/layouts/sider/nav-button'
import { APP_PATHS } from '@/shared/lib/app-router'

export default function Sider() {
  const [location, navigate] = useLocation()
  const { setTheme } = useTheme()
  const light = useIsLightMode()
  const toggleTheme = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const origin = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
    runThemeTransition(origin, () => setTheme(light ? 'dark' : 'light'))
  }

  return (
    <nav className="flex w-14 shrink-0 flex-col items-center border-r border-border bg-sidebar py-3">
      <div className="flex w-full flex-col gap-1 px-2">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon
          return (
            <NavButton
              key={item.key}
              title={item.title}
              active={location === item.path}
              onClick={() => item.path && navigate(item.path)}
            >
              <Icon className="size-5" />
            </NavButton>
          )
        })}
      </div>

      <div className="flex-1" />

      <div className="flex w-full flex-col gap-1 px-2 pb-1">
        <NavButton title="GitHub" onClick={() => openUrl('https://github.com/MisakaTAT/ShipyardX').catch(() => {})}>
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </NavButton>
        <NavButton title={light ? '切换深色' : '切换浅色'} onClick={toggleTheme}>
          {light ? <Moon className="size-5" /> : <Sun className="size-5" />}
        </NavButton>
        <NavButton title="设置" active={location === APP_PATHS.settings} onClick={() => navigate(APP_PATHS.settings)}>
          <Settings className="size-5" />
        </NavButton>
      </div>
    </nav>
  )
}
