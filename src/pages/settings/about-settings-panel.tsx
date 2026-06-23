import { useEffect, useState } from 'react'
import { getName, getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ChevronRight } from 'lucide-react'
import { SettingsPanelShell } from '@/pages/settings/settings-panel-shell'
import { toast } from '@/shared/components/toast'
import { getErrorDescription, getErrorMessage } from '@/shared/lib/errors'

interface AppMetadata {
  name: string
  version: string
}

const ABOUT_ACTIONS = [
  {
    label: '更新说明',
    description: '查看最新版本发布记录',
    href: 'https://github.com/MisakaTAT/ShipyardX/releases',
  },
  {
    label: '官网',
    description: '前往项目主页',
    href: 'https://github.com/MisakaTAT/ShipyardX',
  },
  {
    label: '反馈建议',
    description: '提交 issue 或功能建议',
    href: 'https://github.com/MisakaTAT/ShipyardX/issues',
  },
  {
    label: '源代码',
    description: '浏览项目源码仓库',
    href: 'https://github.com/MisakaTAT/ShipyardX',
  },
  {
    label: '开发者名单',
    description: '查看项目贡献者',
    href: 'https://github.com/MisakaTAT/ShipyardX/graphs/contributors',
  },
] as const

export function AboutSettingsPanel() {
  const startYear = 2026
  const currentYear = new Date().getFullYear()
  const copyrightYears = currentYear > startYear ? `${startYear}-${currentYear}` : String(startYear)
  const [appMetadata, setAppMetadata] = useState<AppMetadata | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void Promise.all([getName(), getVersion()])
      .then(([name, version]) => {
        if (cancelled) return
        setAppMetadata({ name, version })
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(getErrorMessage(error, '读取应用信息失败'), {
          description: getErrorDescription(error, '读取应用信息失败'),
        })
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const openExternal = async (href: string) => {
    try {
      await openUrl(href)
    } catch (error) {
      toast.error(getErrorMessage(error, '打开链接失败'), {
        description: getErrorDescription(error),
      })
    }
  }

  return (
    <SettingsPanelShell>
      <div className="flex items-center gap-4 px-3 py-2">
        <img src="/tauri.svg" alt="ShipyardX logo" className="size-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-foreground">
            {loading ? 'ShipyardX' : (appMetadata?.name ?? 'ShipyardX')}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            基于 Tauri 构建的桌面 Docker 管理客户端，支持 Windows、macOS 和 Linux，提供一致的本地与远程容器工作流。
          </p>
          <p className="text-xs text-muted-foreground">
            Copyright © {copyrightYears}{' '}
            <button
              type="button"
              className="text-foreground underline-offset-4 hover:underline"
              onClick={() => void openExternal('https://github.com/MisakaTAT')}
            >
              MisakaTAT
            </button>
            . All rights reserved.
          </p>
        </div>
      </div>

      <div className="mt-5 divide-y divide-border/50">
        {ABOUT_ACTIONS.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => void openExternal(item.href)}
            className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/20"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">{item.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{item.description}</div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </SettingsPanelShell>
  )
}
