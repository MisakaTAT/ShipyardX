import * as React from 'react'

import { cn } from '@/lib/utils'

/** 主内容区：可滚动 + 页面内边距（与侧栏布局配合） */
function PageScrollArea({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex-1 overflow-auto p-2 md:p-3', className)} {...props} />
}

/** 列表页纵向栈：`gap` 为 true 时在标题区与内容区间距（有顶栏时开启） */
function PageListColumn({
  gap,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  gap?: boolean
}) {
  return <div className={cn('flex h-full flex-col', gap && 'gap-3', className)} {...props} />
}

export { PageListColumn, PageScrollArea }
