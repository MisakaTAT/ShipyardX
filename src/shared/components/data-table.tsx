import { useMemo, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import { Loader2 } from 'lucide-react'
import { TableVirtuoso, type ItemProps, type TableComponents } from 'react-virtuoso'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type RowData,
} from '@tanstack/react-table'
import { TableCell, TableHead, TableRow } from '@/shared/ui/table'
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

interface TableContext<TData> {
  tableClassName?: string
  onRowClick?: (row: TData) => void
}

function cellStyle(width?: string): CSSProperties | undefined {
  return width ? { width, maxWidth: width } : undefined
}

/** 映射必须保持同一引用，否则 Virtuoso 会反复卸载重建表格 */
function createTableComponents<TData>(): TableComponents<Row<TData>, TableContext<TData>> {
  return {
    Table: ({ context, style, ...props }) => (
      <table
        {...props}
        style={{ ...style, tableLayout: 'fixed', width: '100%' }}
        className={cn(
          'caption-bottom border-separate border-spacing-0 text-sm',
          '[&_tbody_tr_td]:border-b [&_tbody_tr_td]:border-border',
          context?.tableClassName
        )}
      />
    ),
    TableRow: ({ item, context, ...props }: ItemProps<Row<TData>> & { context?: TableContext<TData> }) => {
      const onRowClick = context?.onRowClick
      return (
        <TableRow
          {...props}
          onClick={onRowClick ? () => onRowClick(item.original) : undefined}
          className={onRowClick ? 'cursor-pointer' : undefined}
        />
      )
    },
  }
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
  const components = useMemo(() => createTableComponents<TData>(), [])
  const context = useMemo<TableContext<TData>>(() => ({ tableClassName, onRowClick }), [tableClassName, onRowClick])

  if (loading && data.length === 0) {
    return (
      <div className={cn('flex-1 overflow-auto bg-card', className)}>
        <div className="flex h-full min-h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className={cn('flex-1 overflow-auto bg-card', className)}>
        <EmptyState icon={empty?.icon} title={empty?.title} description={empty?.description} />
      </div>
    )
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col bg-card', className)}>
      {/* Virtuoso 需要能解析出高度的容器，用 flex 撑开比 height:100% 稳 */}
      <TableVirtuoso
        data={rows}
        context={context}
        components={components}
        style={{ flex: '1 1 0%', minHeight: 0 }}
        computeItemKey={(_index, row) => row.id}
        fixedHeaderContent={() =>
          table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta
                return (
                  <TableHead
                    key={header.id}
                    className={cn('border-b border-border bg-card', 'truncate', meta?.headerClassName, meta?.className)}
                    style={cellStyle(meta?.width)}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                )
              })}
            </TableRow>
          ))
        }
        itemContent={(_index, row) =>
          row.getVisibleCells().map((cell) => {
            const meta = cell.column.columnDef.meta
            return (
              <TableCell
                key={cell.id}
                className={cn('text-muted-foreground', 'truncate *:max-w-full *:truncate', meta?.className)}
                style={cellStyle(meta?.width)}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            )
          })
        }
      />
    </div>
  )
}

export type { ColumnDef } from '@tanstack/react-table'
