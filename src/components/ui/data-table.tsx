'use client'

import * as React from 'react'

import { Table as TableRoot, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const tableBodyRowClassName =
  'border-b border-border bg-card transition-colors hover:bg-muted/50 dark:hover:bg-muted/10'

const tableHeadCellClassName = 'text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground'

const tdBaseClassName = 'text-xs text-muted-foreground min-w-0'

const tdTruncateClassName = 'min-w-0 truncate'

const tdNoTruncateClassName = 'max-w-none overflow-visible whitespace-normal'

function BodyTableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr data-slot="table-body-row" className={cn(tableBodyRowClassName, className)} {...props} />
}

function getCellValue<T extends object>(record: T, field: keyof T | (string & {})): unknown {
  const key = String(field)
  if (key.includes('.')) {
    return key.split('.').reduce<unknown>((acc, part) => {
      if (acc == null || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[part]
    }, record as unknown)
  }
  return (record as Record<string, unknown>)[key]
}

export type DataTableColumn<T extends object> = {
  key: string
  title: React.ReactNode
  dataIndex?: keyof T | (string & {})
  render?: (value: unknown, record: T, index: number) => React.ReactNode
  headerClassName?: string
  className?: string
  colWidth?: string
  truncate?: boolean
  thStyle?: React.CSSProperties
  tdStyle?: React.CSSProperties
}

type DataTableProps<T extends object> = {
  columns: DataTableColumn<T>[]
  rows: readonly T[]
  rowKey: keyof T | ((record: T, index: number) => React.Key)
  className?: string
  colgroup?: React.ReactNode
}

export function DataTable<T extends object>({ columns, rows, rowKey, className, colgroup }: DataTableProps<T>) {
  const resolveKey = React.useCallback(
    (record: T, index: number): React.Key => {
      if (typeof rowKey === 'function') return rowKey(record, index)
      const v = record[rowKey as keyof T]
      if (v != null && (typeof v === 'string' || typeof v === 'number')) return v
      return index
    },
    [rowKey]
  )

  const autoColgroup = React.useMemo(() => {
    const hasColWidths = columns.some((c) => c.colWidth != null && c.colWidth !== '')
    if (!hasColWidths) return null
    return (
      <colgroup>
        {columns.map((col) => (
          <col key={col.key} style={col.colWidth ? { width: col.colWidth } : undefined} />
        ))}
      </colgroup>
    )
  }, [columns])

  return (
    <TableRoot className={className}>
      {colgroup ?? autoColgroup}
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={col.key} className={cn(tableHeadCellClassName, col.headerClassName)} style={col.thStyle}>
              {col.title}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((record, rowIndex) => (
          <BodyTableRow key={resolveKey(record, rowIndex)}>
            {columns.map((col) => {
              const value = col.dataIndex !== undefined ? getCellValue(record, col.dataIndex) : undefined
              const content = col.render ? col.render(value, record, rowIndex) : ((value as React.ReactNode) ?? null)
              return (
                <TableCell
                  key={col.key}
                  className={cn(
                    tdBaseClassName,
                    col.truncate === false ? tdNoTruncateClassName : tdTruncateClassName,
                    col.className
                  )}
                  style={col.tdStyle}
                >
                  {content}
                </TableCell>
              )
            })}
          </BodyTableRow>
        ))}
      </TableBody>
    </TableRoot>
  )
}
