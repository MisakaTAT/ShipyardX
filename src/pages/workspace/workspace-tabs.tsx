import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { RefreshCw, X } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Tabs, TabsList } from '@/shared/ui/tabs'
import { cn } from '@/shared/lib/utils'

export interface WorkspaceTabItem<K extends string = string> {
  key: K
  icon: ReactNode
  label: string
}

interface WorkspaceTabsProps<K extends string> {
  items: WorkspaceTabItem<K>[]
  activeKey: K
  onChange: (key: K) => void
  dockerOk: boolean
  /** 即使 Docker 不可用也始终可点的 tab（例如终端） */
  alwaysEnabledKeys?: K[]
  onDockerRetry: () => void
  onDisconnect: () => void
}

/** Workspace 顶部 Tab 栏：motion pill + 禁用态 + 断开/重试按钮 */
export function WorkspaceTabs<K extends string>({
  items,
  activeKey,
  onChange,
  dockerOk,
  alwaysEnabledKeys = [],
  onDockerRetry,
  onDisconnect,
}: WorkspaceTabsProps<K>) {
  const alwaysEnabled = new Set<K>(alwaysEnabledKeys)
  return (
    <Tabs
      value={activeKey}
      onValueChange={(v) => onChange(v as K)}
      className="relative flex flex-col gap-3 perspective-[1000px]"
    >
      <div className="overflow-hidden rounded-xl border border-border bg-card p-1.5">
        <TabsList
          variant="line"
          className="no-visible-scrollbar relative h-auto w-full max-w-full justify-start gap-2 overflow-visible bg-transparent p-0"
        >
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {items.map((item) => {
              const isActive = activeKey === item.key
              const disabled = !dockerOk && !alwaysEnabled.has(item.key)
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(item.key)}
                  className={cn(
                    'relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
                    isActive ? 'text-background' : 'text-muted-foreground hover:text-foreground',
                    !isActive && !disabled && 'hover:bg-muted',
                    disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'
                  )}
                >
                  {isActive ? (
                    <motion.span
                      layoutId="workspace-active-tab-pill"
                      transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }}
                      className="absolute inset-0 rounded-lg bg-primary"
                    />
                  ) : null}
                  <span className="relative z-10">{item.icon}</span>
                  <span className="relative z-10">{item.label}</span>
                </button>
              )
            })}
          </div>

          <div className="ml-auto flex items-center gap-1">
            {!dockerOk ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-lg hover:bg-amber-500/15 hover:text-amber-500"
                title="重新检测 Docker"
                onClick={onDockerRetry}
              >
                <RefreshCw className="size-[18px]" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-lg text-muted-foreground hover:bg-red-500/15 hover:text-red-500"
              title="断开连接"
              onClick={onDisconnect}
            >
              <X className="size-[18px]" />
            </Button>
          </div>
        </TabsList>
      </div>
    </Tabs>
  )
}
