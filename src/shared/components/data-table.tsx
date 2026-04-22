import type { ComponentType, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { EmptyState } from '@/shared/components/empty-state'
import { cn } from '@/shared/lib/utils'

export interface ColumnDef<T> {
  key: string
  title: ReactNode
  /** 列宽，例如 "12rem" / "80px"；不指定则自动。 */
  width?: string
  className?: string
  render: (row: T, index: number) => ReactNode
}

interface EmptyOption {
  icon?: ComponentType<LucideProps>
  title?: ReactNode
  description?: ReactNode
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  rowKey: (row: T) => string
  loading?: boolean
  empty?: EmptyOption
  className?: string
  tableClassName?: string
  /** 行点击：常用于打开详情，不与列内按钮冲突 */
  onRowClick?: (row: T) => void
}

/**
 * 统一数据表：根据 columns 配置渲染 Table，内置 loading 圈、空态；替代各面板里重复的 <Table>+手写 header/rows 代码。
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading,
  empty,
  className,
  tableClassName,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className={cn('flex-1 overflow-auto bg-card', className)}>
      {loading && data.length === 0 ? (
        <div className="flex h-full min-h-48 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={empty?.icon} title={empty?.title} description={empty?.description} />
      ) : (
        <Table className={cn('w-full table-fixed', tableClassName)}>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={col.className}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.title}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, idx) => (
              <TableRow
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'cursor-pointer' : undefined}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render(row, idx)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
