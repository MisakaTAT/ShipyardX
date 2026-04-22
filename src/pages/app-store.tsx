import { Construction, Stone } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'

export default function AppStore() {
  return (
    <div className="flex min-h-[560px] flex-col items-center justify-center px-4 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
          <Stone className="size-7 text-primary" />
        </div>

        <Badge
          variant="outline"
          className="mb-3 gap-1 border-amber-500/25 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-400/95"
        >
          <Construction className="size-3" />
          开发中
        </Badge>

        <h1 className="text-base font-semibold text-foreground">应用商店</h1>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          后续将在此提供应用模板、一键部署与扩展插件等能力，敬请期待。
        </p>
      </div>
    </div>
  )
}
