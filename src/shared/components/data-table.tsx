import type { ComponentType, CSSProperties, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import { Loader2 } from 'lucide-react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowData } from '@tanstack/react-table'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { EmptyState } from '@/shared/components/empty-state'
import { cn } from '@/shared/lib/utils'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line unused-imports/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    width?: string
    className?: string
    headerClassName?: string
  }
}

interface EmptyOption {
  icon?: ComponentType<LucideProps>
  title?: ReactNode
  description?: ReactNode
}

interface DataTableProps<TData, TValue = unknown> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  getRowId?: (row: TData, index: number) => string
  loading?: boolean
  empty?: EmptyOption
  className?: string
  tableClassName?: string
  onRowClick?: (row: TData) => void
}

export function DataTable<TData, TValue = unknown>({
  columns,
  data,
  getRowId,
  loading,
  empty,
  className,
  tableClassName,
  onRowClick,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  })

  const rows = table.getRowModel().rows

  return (
    <div className={cn('flex-1 overflow-auto bg-card', className)}>
      {loading && data.length === 0 ? (
        <div className="flex h-full min-h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={empty?.icon} title={empty?.title} description={empty?.description} />
      ) : (
        <table
          className={cn(
            'w-full table-fixed caption-bottom border-separate border-spacing-0 text-sm',
            '[&_tbody_tr_td]:border-b [&_tbody_tr_td]:border-border [&_tbody_tr:last-child_td]:border-b-0',
            tableClassName
          )}
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta
                  const style: CSSProperties | undefined = meta?.width
                    ? { width: meta.width, maxWidth: meta.width }
                    : undefined
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        'sticky top-0 z-10 border-b border-border bg-card',
                        'truncate',
                        meta?.headerClassName,
                        meta?.className
                      )}
                      style={style}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={onRowClick ? 'cursor-pointer' : undefined}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta
                  const style: CSSProperties | undefined = meta?.width
                    ? { width: meta.width, maxWidth: meta.width }
                    : undefined
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn('text-muted-foreground', 'truncate *:max-w-full *:truncate', meta?.className)}
                      style={style}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </table>
      )}
    </div>
  )
}

export type { ColumnDef } from '@tanstack/react-table'
