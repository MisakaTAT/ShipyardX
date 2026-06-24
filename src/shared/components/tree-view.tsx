import { useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export type TreeViewNodeKind = 'file' | 'directory'

export interface TreeViewNode {
  id: string
  path: string
  name?: string
  kind: TreeViewNodeKind
  readonly?: boolean
  badge?: ReactNode
  actions?: ReactNode
}

interface TreeViewProps {
  nodes: TreeViewNode[]
  selectedId?: string
  onSelect?: (node: TreeViewNode) => void
  className?: string
}

interface InternalNode {
  id: string
  path: string
  name: string
  kind: TreeViewNodeKind
  readonly?: boolean
  badge?: ReactNode
  actions?: ReactNode
  children: InternalNode[]
}

export function TreeView({ nodes, selectedId, onSelect, className }: TreeViewProps) {
  const roots = useMemo(() => buildTree(nodes), [nodes])
  const defaultExpanded = useMemo(() => collectDirectoryIds(roots), [roots])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className={cn('space-y-0.5 text-xs', className)}>
      {roots.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          collapsed={collapsed}
          defaultExpanded={defaultExpanded}
          onToggle={toggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function TreeRow({
  node,
  depth,
  selectedId,
  collapsed,
  defaultExpanded,
  onToggle,
  onSelect,
}: {
  node: InternalNode
  depth: number
  selectedId?: string
  collapsed: Set<string>
  defaultExpanded: Set<string>
  onToggle: (id: string) => void
  onSelect?: (node: TreeViewNode) => void
}) {
  const isDirectory = node.kind === 'directory'
  const expanded = isDirectory && defaultExpanded.has(node.id) && !collapsed.has(node.id)
  const selected = selectedId === node.id

  return (
    <>
      <div
        role="treeitem"
        aria-selected={selected}
        aria-expanded={isDirectory ? expanded : undefined}
        className={cn(
          'group flex h-7 w-full cursor-default items-center gap-1 rounded-md pr-1 text-left transition-colors',
          selected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={() => {
          if (isDirectory) {
            onToggle(node.id)
            return
          }
          onSelect?.(toPublicNode(node))
        }}
      >
        <button
          type="button"
          className={cn('flex size-4 shrink-0 items-center justify-center rounded-sm', !isDirectory && 'invisible')}
          onClick={(event) => {
            event.stopPropagation()
            if (isDirectory) onToggle(node.id)
          }}
          tabIndex={isDirectory ? 0 : -1}
          aria-label={expanded ? '折叠目录' : '展开目录'}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
        </button>
        {isDirectory ? (
          expanded ? (
            <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono" title={node.path}>
          {node.name}
        </span>
        {node.badge ? <span className="shrink-0">{node.badge}</span> : null}
        {node.actions ? (
          <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">{node.actions}</span>
        ) : null}
      </div>
      {expanded
        ? node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              collapsed={collapsed}
              defaultExpanded={defaultExpanded}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))
        : null}
    </>
  )
}

function buildTree(nodes: TreeViewNode[]) {
  const root: InternalNode = {
    id: '__root__',
    path: '',
    name: '',
    kind: 'directory',
    children: [],
  }
  const byPath = new Map<string, InternalNode>()
  byPath.set('', root)

  const sorted = [...nodes].sort((a, b) => a.path.localeCompare(b.path))
  for (const node of sorted) {
    const parts = node.path.split('/').filter(Boolean)
    let parent = root
    let currentPath = ''
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const isLeaf = index === parts.length - 1
      let current = byPath.get(currentPath)
      if (!current) {
        current = {
          id: isLeaf ? node.id : currentPath,
          path: currentPath,
          name: part,
          kind: isLeaf ? node.kind : 'directory',
          readonly: isLeaf ? node.readonly : false,
          badge: isLeaf ? node.badge : undefined,
          actions: isLeaf ? node.actions : undefined,
          children: [],
        }
        byPath.set(currentPath, current)
        parent.children.push(current)
      } else if (isLeaf) {
        current.id = node.id
        current.kind = node.kind
        current.readonly = node.readonly
        current.badge = node.badge
        current.actions = node.actions
      }
      parent = current
    }
  }

  sortTree(root.children)
  return root.children
}

function sortTree(nodes: InternalNode[]) {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const node of nodes) sortTree(node.children)
}

function collectDirectoryIds(nodes: InternalNode[]) {
  const ids = new Set<string>()
  const visit = (node: InternalNode) => {
    if (node.kind === 'directory') ids.add(node.id)
    for (const child of node.children) visit(child)
  }
  for (const node of nodes) visit(node)
  return ids
}

function toPublicNode(node: InternalNode): TreeViewNode {
  return {
    id: node.id,
    path: node.path,
    name: node.name,
    kind: node.kind,
    readonly: node.readonly,
    badge: node.badge,
    actions: node.actions,
  }
}
