import * as React from 'react'

import { cn } from '@/lib/utils'

export const tableHeaderStickyClassName =
  'sticky top-0 z-10 backdrop-blur-sm bg-(--bg-panel) outline-1 outline-solid outline-border outline-offset-0'

export const tableBodyRowClassName = 'border-b border-border bg-(--bg-panel) transition-colors hover:bg-(--bg-surface)'

export const dataTableHead = {
  first: 'text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-(--text-muted)',
  mid: 'text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--text-muted)',
  last: 'text-right px-5 py-3 text-xs font-semibold uppercase tracking-wider text-(--text-muted)',
} as const

export const eventTableHead = {
  first: 'text-left pl-5 pr-3 py-2.5 font-semibold uppercase tracking-wider text-[11px] w-[100px] text-(--text-muted)',
  mid: 'text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[11px] w-[100px] text-(--text-muted)',
  wide: 'text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[11px] w-[180px] text-(--text-muted)',
  last: 'text-left px-3 pr-5 py-2.5 font-semibold uppercase tracking-wider text-[11px] text-(--text-muted)',
} as const

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="relative w-full">
      <table data-slot="table" className={cn(className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn(tableHeaderStickyClassName, className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return <tfoot data-slot="table-footer" className={cn(className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr data-slot="table-row" className={cn(className)} {...props} />
}

function TableBodyRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr data-slot="table-body-row" className={cn(tableBodyRowClassName, className)} {...props} />
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return <th data-slot="table-head" className={cn(className)} {...props} />
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return <td data-slot="table-cell" className={cn(className)} {...props} />
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return <caption data-slot="table-caption" className={cn(className)} {...props} />
}

export { Table, TableHeader, TableBody, TableBodyRow, TableFooter, TableHead, TableRow, TableCell, TableCaption }
