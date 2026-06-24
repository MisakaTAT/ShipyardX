import { useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import Editor from '@monaco-editor/react'
import {
  CheckCircle2,
  Circle,
  CopyPlus,
  FilePlus,
  FolderPlus,
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react'
import {
  commands,
  type AppTemplate,
  type AppTemplateField,
  type AppTemplateFile,
  type InstallStepEvent,
} from '@/types/app-bindings'
import {
  useCreateTemplate,
  useDeleteTemplate,
  useDeployTemplate,
  useExtractTemplateFields,
  useTemplates,
  useUpdateTemplate,
} from '@/features/templates/api/use-templates'
import { useServers } from '@/features/servers/api/use-servers'
import { HighlightLog } from '@/features/appstore/ui/highlight-log'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { ConfirmDialog, EmptyState, SearchInput, TreeView, type TreeViewNode } from '@/shared/components'
import { StandardDialog } from '@/shared/components/standard-dialog'
import { StandardFullScreenDialog } from '@/shared/components/standard-fullscreen-dialog'
import { toast } from '@/shared/components/toast'
import { getErrorMessage } from '@/shared/lib/errors'

const STEP_LABELS: Record<string, string> = {
  prepare: '准备模板',
  deploy: '部署文件',
  network: '创建网络',
  start: '启动容器',
}

const COMPOSE_PATH = 'docker-compose.yml'

const EMPTY_COMPOSE = `services:
  web:
    image: nginx:latest
    container_name: \${CONTAINER_NAME}
    ports:
      - "\${WEB_PORT}:80"
    restart: unless-stopped
`

export default function AppTemplatesPage() {
  const { data: templates = [], isLoading, isFetching } = useTemplates()
  const remove = useDeleteTemplate()
  const [search, setSearch] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<AppTemplate | null>(null)
  const [deploying, setDeploying] = useState<AppTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AppTemplate | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return templates
    return templates.filter((template) => {
      const tags = templateTags(template).join(' ').toLowerCase()
      return (
        template.name.toLowerCase().includes(q) ||
        templateDescription(template).toLowerCase().includes(q) ||
        tags.includes(q) ||
        template.compose.toLowerCase().includes(q)
      )
    })
  }, [search, templates])

  if (isLoading || (isFetching && templates.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 overflow-auto p-3">
        <div className={`flex h-full flex-col ${templates.length > 0 ? 'gap-3' : ''}`}>
          {templates.length > 0 ? (
            <div className="shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-foreground">应用模板</h1>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    保存可复用的 Docker Compose 模板，并部署到任意服务器。
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    setEditing(null)
                    setEditorOpen(true)
                  }}
                >
                  <Plus />
                  创建模板
                </Button>
              </div>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="搜索模板名称、标签或 Compose 内容..."
                className="mt-3 w-full"
              />
            </div>
          ) : null}

          {templates.length === 0 ? (
            <div className="flex h-full flex-1 items-center justify-center px-4">
              <div className="max-w-xs text-center">
                <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-7">
                  <CopyPlus />
                </div>
                <h2 className="text-sm font-semibold text-foreground">还没有应用模板</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  粘贴 docker-compose.yml，识别变量字段，保存成自己的私有应用。
                </p>
                <div className="mt-5">
                  <Button onClick={() => setEditorOpen(true)}>
                    <Plus />
                    创建模板
                  </Button>
                </div>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-border bg-card">
              <EmptyState icon={Search} title={`没有匹配「${search}」的模板`} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 overflow-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onEdit={() => {
                    setEditing(template)
                    setEditorOpen(true)
                  }}
                  onDeploy={() => setDeploying(template)}
                  onDelete={() => setDeleteTarget(template)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <TemplateEditorDialog
        open={editorOpen}
        template={editing}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (!open) setEditing(null)
        }}
      />
      <TemplateDeployDialog template={deploying} onClose={() => setDeploying(null)} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="删除模板"
        description={deleteTarget ? `确定要删除「${deleteTarget.name}」吗？` : undefined}
        confirmText="删除"
        destructive
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget.id)
        }}
      />
    </div>
  )
}

function TemplateCard({
  template,
  onEdit,
  onDeploy,
  onDelete,
}: {
  template: AppTemplate
  onEdit: () => void
  onDeploy: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex min-h-58 flex-col rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground" title={template.name}>
            {template.name}
          </h2>
          <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">
            {template.description || '无描述'}
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {templateFields(template).length} 字段 / {templateFiles(template).length} 文件 /{' '}
          {templateDirectories(template).length} 目录
        </Badge>
      </div>

      {templateTags(template).length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {templateTags(template)
            .slice(0, 5)
            .map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px]">
                {tag}
              </Badge>
            ))}
        </div>
      ) : null}

      <pre className="mt-3 min-h-22 flex-1 overflow-hidden rounded-md border border-border bg-muted/35 p-2 text-[11px] leading-relaxed text-muted-foreground">
        {template.compose.split('\n').slice(0, 6).join('\n')}
      </pre>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-muted-foreground" title={template.updated_at}>
          更新于 {formatDate(template.updated_at)}
        </span>
        <div className="flex items-center gap-1.5">
          <Button type="button" size="icon-sm" variant="ghost" onClick={onEdit} aria-label="编辑模板">
            <Pencil className="size-3.5" />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" onClick={onDelete} aria-label="删除模板">
            <Trash2 className="size-3.5" />
          </Button>
          <Button type="button" size="sm" onClick={onDeploy}>
            <Play className="size-3.5" />
            部署
          </Button>
        </div>
      </div>
    </div>
  )
}

function TemplateEditorDialog({
  open,
  template,
  onOpenChange,
}: {
  open: boolean
  template: AppTemplate | null
  onOpenChange: (open: boolean) => void
}) {
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()
  const extractFields = useExtractTemplateFields()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [compose, setCompose] = useState(EMPTY_COMPOSE)
  const [directories, setDirectories] = useState<string[]>([])
  const [files, setFiles] = useState<AppTemplateFile[]>([])
  const [activePath, setActivePath] = useState(COMPOSE_PATH)
  const [newFileOpen, setNewFileOpen] = useState(false)
  const [newFilePath, setNewFilePath] = useState('')
  const [newDirectoryOpen, setNewDirectoryOpen] = useState(false)
  const [newDirectoryPath, setNewDirectoryPath] = useState('')
  const [fields, setFields] = useState<AppTemplateField[]>([])
  const editorOptions = useMemo(
    () => ({
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on' as const,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      tabSize: 2,
      insertSpaces: true,
      lineNumbers: 'on' as const,
      renderLineHighlight: 'line' as const,
      padding: { top: 12, bottom: 12 },
      folding: true,
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      automaticLayout: true,
    }),
    []
  )

  useEffect(() => {
    if (!open) return
    setName(template?.name ?? '')
    setDescription(template ? templateDescription(template) : '')
    setTags(template ? templateTags(template).join(', ') : '')
    setCompose(template?.compose ?? EMPTY_COMPOSE)
    setDirectories(template ? templateDirectories(template) : [])
    setFiles(template ? templateFiles(template) : [])
    setActivePath(COMPOSE_PATH)
    setNewFileOpen(false)
    setNewFilePath('')
    setNewDirectoryOpen(false)
    setNewDirectoryPath('')
    setFields(template ? templateFields(template) : [])
  }, [open, template])

  const busy = createTemplate.isPending || updateTemplate.isPending

  const handleExtract = async () => {
    const source = [compose, ...files.map((file) => file.content ?? '')].join('\n')
    const detected = await extractFields.mutateAsync(source)
    setFields((current) => mergeFields(current, detected))
    toast.success(`已识别 ${detected.length} 个变量`)
  }

  const handleSubmit = async () => {
    const input = {
      name,
      description,
      tags: splitTags(tags),
      compose,
      directories,
      files,
      fields,
    }
    if (template) {
      await updateTemplate.mutateAsync({ templateId: template.id, input })
    } else {
      await createTemplate.mutateAsync(input)
    }
    onOpenChange(false)
  }

  const activeFile = files.find((file) => file.path === activePath) ?? null
  const activeValue = activePath === COMPOSE_PATH ? compose : (activeFile?.content ?? '')
  const activeLanguage = languageForPath(activePath)

  const handleEditorChange = (value: string) => {
    if (activePath === COMPOSE_PATH) {
      setCompose(value)
      return
    }
    setFiles((current) => current.map((file) => (file.path === activePath ? { ...file, content: value } : file)))
  }

  const handleCreateFile = () => {
    const normalized = normalizeFilePath(newFilePath)
    if (!normalized) return
    if (normalized === COMPOSE_PATH || normalized === '.env') {
      toast.error('这是保留文件名')
      return
    }
    if (files.some((file) => file.path === normalized)) {
      toast.error('文件已存在')
      return
    }
    setFiles((current) => [...current, { path: normalized, content: '', executable: false }])
    setActivePath(normalized)
    setNewFilePath('')
    setNewFileOpen(false)
  }

  const handleCreateDirectory = () => {
    const normalized = normalizeFilePath(newDirectoryPath)
    if (!normalized) return
    if (directories.includes(normalized)) {
      toast.error('目录已存在')
      return
    }
    setDirectories((current) => [...current, normalized].sort())
    setNewDirectoryPath('')
    setNewDirectoryOpen(false)
  }

  const handleUploadFile = async () => {
    const selected = await openDialog({ multiple: false, directory: false })
    if (!selected || Array.isArray(selected)) return
    try {
      const imported = await commands.importTemplateFile(selected)
      const currentDirectory = activeFile ? parentDirectory(activeFile.path) : ''
      const targetPath = currentDirectory ? `${currentDirectory}/${imported.path}` : imported.path
      const normalized = normalizeFilePath(targetPath)
      if (!normalized) return
      if (normalized === COMPOSE_PATH || normalized === '.env') {
        toast.error('这是保留文件名')
        return
      }
      if (files.some((file) => file.path === normalized)) {
        toast.error('文件已存在')
        return
      }
      setFiles((current) => [...current, { ...imported, path: normalized }])
      setActivePath(normalized)
      toast.success('文件已导入')
    } catch (error) {
      toast.error(getErrorMessage(error, '导入文件失败'))
    }
  }

  const handleDeleteFile = (path: string) => {
    setFiles((current) => current.filter((file) => file.path !== path))
    if (activePath === path) setActivePath(COMPOSE_PATH)
  }

  const handleDeleteDirectory = (path: string) => {
    setDirectories((current) => current.filter((directory) => directory !== path))
  }

  const treeNodes = useMemo<TreeViewNode[]>(
    () => [
      { id: COMPOSE_PATH, path: COMPOSE_PATH, kind: 'file', readonly: true },
      ...directories.map((directory) => ({
        id: `dir:${directory}`,
        path: directory,
        kind: 'directory' as const,
        actions: (
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:text-destructive"
            onClick={(event) => {
              event.stopPropagation()
              handleDeleteDirectory(directory)
            }}
            aria-label={`删除目录 ${directory}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        ),
      })),
      ...files.map((file) => ({
        id: file.path,
        path: file.path,
        kind: 'file' as const,
        badge: file.executable ? <span className="rounded bg-muted px-1 font-mono text-[10px]">x</span> : undefined,
        actions: (
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:text-destructive"
            onClick={(event) => {
              event.stopPropagation()
              handleDeleteFile(file.path)
            }}
            aria-label={`删除文件 ${file.path}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        ),
      })),
    ],
    [directories, files]
  )

  return (
    <>
      <StandardFullScreenDialog
        open={open}
        onOpenChange={onOpenChange}
        title={template ? '编辑应用模板' : '创建应用模板'}
        subtitle="Docker Compose 模板"
        icon={CopyPlus}
        disableClose={busy}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              取消
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              保存模板
            </Button>
          </div>
        }
      >
        <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] overflow-hidden bg-background">
          <aside className="min-h-0 overflow-auto border-r border-border bg-card p-4">
            <div className="space-y-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="模板名称" />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="模板描述"
                className="min-h-22 resize-none"
              />
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="标签，用逗号分隔" />
            </div>

            <div className="mt-5 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">文件</span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => setNewDirectoryOpen(true)}
                  aria-label="新建目录"
                >
                  <FolderPlus className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => setNewFileOpen(true)}
                  aria-label="新建文件"
                >
                  <FilePlus className="size-3.5" />
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void handleUploadFile()}>
                  上传
                </Button>
              </div>
            </div>
            <TreeView
              className="mt-3"
              nodes={treeNodes}
              selectedId={activePath}
              onSelect={(node) => {
                if (node.kind === 'file') setActivePath(node.id)
              }}
            />

            {activeFile ? (
              <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={activeFile.executable === true}
                  onChange={(event) =>
                    setFiles((current) =>
                      current.map((file) =>
                        file.path === activeFile.path ? { ...file, executable: event.target.checked } : file
                      )
                    )
                  }
                />
                <span>部署后添加可执行权限</span>
              </label>
            ) : null}

            <div className="mt-5 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">变量字段</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void handleExtract()}>
                {extractFields.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Search className="size-3.5" />
                )}
                自动识别
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {fields.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  还没有变量字段
                </div>
              ) : (
                fields.map((field, index) => (
                  <FieldEditor
                    key={field.env_key}
                    field={field}
                    onChange={(next) => setFields((current) => current.map((item, i) => (i === index ? next : item)))}
                    onDelete={() => setFields((current) => current.filter((_, i) => i !== index))}
                  />
                ))
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col p-4">
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <span className="font-mono text-xs font-medium text-foreground">{activePath}</span>
              <span className="text-[11px] text-muted-foreground">支持 ${'{VAR}'} 变量</span>
            </div>
            <div
              className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border"
              style={{ background: '#1e1e1e' }}
            >
              <Editor
                height="100%"
                language={activeLanguage}
                theme="vs-dark"
                value={activeValue}
                path={activePath}
                onChange={(value) => handleEditorChange(value ?? '')}
                options={editorOptions}
                loading={
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    初始化编辑器…
                  </div>
                }
              />
            </div>
          </section>
        </div>
      </StandardFullScreenDialog>

      <StandardDialog
        open={newFileOpen}
        onOpenChange={(next) => {
          setNewFileOpen(next)
          if (!next) setNewFilePath('')
        }}
        title="新建文件"
        icon={FilePlus}
        widthClassName="w-[460px]"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setNewFileOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={handleCreateFile}>
              创建
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Input
            value={newFilePath}
            onChange={(event) => setNewFilePath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleCreateFile()
            }}
            placeholder="config/app.yml"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">使用相对路径，目录会在部署时自动创建。</p>
        </div>
      </StandardDialog>

      <StandardDialog
        open={newDirectoryOpen}
        onOpenChange={(next) => {
          setNewDirectoryOpen(next)
          if (!next) setNewDirectoryPath('')
        }}
        title="新建目录"
        icon={FolderPlus}
        widthClassName="w-[460px]"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setNewDirectoryOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={handleCreateDirectory}>
              创建
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Input
            value={newDirectoryPath}
            onChange={(event) => setNewDirectoryPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleCreateDirectory()
            }}
            placeholder="config"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">空目录也会在部署时创建。</p>
        </div>
      </StandardDialog>
    </>
  )
}

function FieldEditor({
  field,
  onChange,
  onDelete,
}: {
  field: AppTemplateField
  onChange: (field: AppTemplateField) => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2">
      <div className="flex items-center gap-2">
        <Input
          value={field.env_key}
          onChange={(e) => onChange({ ...field, env_key: e.target.value })}
          className="h-8 font-mono text-xs"
        />
        <Button type="button" size="icon-sm" variant="ghost" onClick={onDelete} aria-label="删除字段">
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
        <Input
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          placeholder="显示名称"
          className="h-8 text-xs"
        />
        <Input
          value={fieldDefaultValue(field)}
          onChange={(e) => onChange({ ...field, default_value: e.target.value })}
          placeholder="默认值"
          className="h-8 text-xs"
          type={field.field_type === 'password' ? 'password' : 'text'}
        />
        <select
          value={field.field_type}
          onChange={(e) => onChange({ ...field, field_type: e.target.value })}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
        >
          <option value="text">文本</option>
          <option value="password">密码</option>
          <option value="number">数字</option>
        </select>
      </div>
    </div>
  )
}

function TemplateDeployDialog({ template, onClose }: { template: AppTemplate | null; onClose: () => void }) {
  const { data: servers = [] } = useServers()
  const deploy = useDeployTemplate()
  const [selectedServerId, setSelectedServerId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [steps, setSteps] = useState<Map<string, InstallStepEvent>>(new Map())
  const [outputs, setOutputs] = useState<Map<string, string[]>>(new Map())

  useEffect(() => {
    if (!template) return
    setSelectedServerId(servers[0]?.id ?? '')
    setValues(Object.fromEntries(templateFields(template).map((field) => [field.env_key, fieldDefaultValue(field)])))
    setSteps(new Map())
    setOutputs(new Map())
  }, [servers, template])

  useEffect(() => {
    const unlisten = listen<InstallStepEvent>('install-step-event', (event) => {
      const payload = event.payload
      if (payload.output_chunk) {
        setOutputs((current) => {
          const next = new Map(current)
          const existing = next.get(payload.step) || []
          next.set(payload.step, [...existing, payload.output_chunk!])
          return next
        })
      } else if (payload.step) {
        setSteps((current) => {
          const next = new Map(current)
          next.set(payload.step, payload)
          return next
        })
      }
    })
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])

  const handleDeploy = async () => {
    if (!template || !selectedServerId) return
    try {
      setSteps(new Map())
      setOutputs(new Map())
      await deploy.mutateAsync({
        serverId: selectedServerId,
        req: {
          server_id: selectedServerId,
          template_id: template.id,
          env_values: values,
        },
      })
      toast.success('模板部署完成')
    } catch (error) {
      toast.error(getErrorMessage(error, '模板部署失败'))
    }
  }

  const inProgress = deploy.isPending
  const showProgress = inProgress || deploy.isSuccess || deploy.isError || steps.size > 0

  return (
    <StandardDialog
      open={!!template}
      onOpenChange={(open) => {
        if (!open && !inProgress) {
          deploy.reset()
          onClose()
        }
      }}
      title={template ? `部署 ${template.name}` : '部署模板'}
      icon={Play}
      widthClassName="w-[640px]"
      disableClose={inProgress}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={inProgress}>
            关闭
          </Button>
          {!showProgress ? (
            <Button type="button" onClick={() => void handleDeploy()} disabled={!selectedServerId || inProgress}>
              {inProgress ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              部署
            </Button>
          ) : null}
        </div>
      }
    >
      {!template ? null : showProgress ? (
        <DeployProgress steps={steps} outputs={outputs} />
      ) : (
        <div className="space-y-4">
          <select
            value={selectedServerId}
            onChange={(e) => setSelectedServerId(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="">选择服务器...</option>
            {servers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name} ({server.host})
              </option>
            ))}
          </select>

          {templateFields(template).length > 0 ? (
            <div className="space-y-3">
              {templateFields(template).map((field) => (
                <label key={field.env_key} className="block space-y-1.5">
                  <span className="text-xs font-medium text-foreground">
                    {field.label || field.env_key}
                    {field.required ? <span className="text-destructive"> *</span> : null}
                  </span>
                  <Input
                    value={values[field.env_key] ?? ''}
                    onChange={(e) => setValues((current) => ({ ...current, [field.env_key]: e.target.value }))}
                    type={
                      field.field_type === 'password' ? 'password' : field.field_type === 'number' ? 'number' : 'text'
                    }
                    placeholder={field.env_key}
                  />
                </label>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              这个模板没有变量字段，将直接使用 Compose 内容部署。
            </div>
          )}
        </div>
      )}
    </StandardDialog>
  )
}

function DeployProgress({ steps, outputs }: { steps: Map<string, InstallStepEvent>; outputs: Map<string, string[]> }) {
  return (
    <div>
      {['prepare', 'deploy', 'network', 'start'].map((stepKey) => {
        const step = steps.get(stepKey)
        const isRunning = step?.status === 'running'
        const isDone = step?.status === 'done'
        const isError = step?.status === 'error'
        const stepOutputs = outputs.get(stepKey) || []
        return (
          <div key={stepKey}>
            <div
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-xs transition-colors ${
                isRunning ? 'bg-accent text-foreground' : ''
              }${isError ? 'bg-red-500/10 text-red-600 dark:text-red-400' : ''}${
                isDone ? 'text-muted-foreground' : ''
              }${!step ? 'text-muted-foreground/40' : ''}`}
            >
              {isDone ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
              ) : isError ? (
                <XCircle className="size-3.5 shrink-0 text-red-500" />
              ) : isRunning ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
              ) : (
                <Circle className="size-3.5 shrink-0" />
              )}
              <span>{STEP_LABELS[stepKey]}</span>
              {step?.message && stepOutputs.length === 0 ? (
                <span className="ml-auto max-w-56 truncate text-[11px]">{step.message}</span>
              ) : null}
            </div>
            {stepOutputs.length > 0 ? <HighlightLog outputs={stepOutputs} /> : null}
          </div>
        )
      })}
    </div>
  )
}

function mergeFields(current: AppTemplateField[], detected: AppTemplateField[]) {
  const existing = new Map(current.map((field) => [field.env_key, field]))
  for (const field of detected) {
    if (!existing.has(field.env_key)) {
      existing.set(field.env_key, field)
    }
  }
  return Array.from(existing.values())
}

function templateDescription(template: AppTemplate) {
  return template.description ?? ''
}

function templateTags(template: AppTemplate) {
  return template.tags ?? []
}

function templateFields(template: AppTemplate) {
  return template.fields ?? []
}

function templateDirectories(template: AppTemplate) {
  return template.directories ?? []
}

function templateFiles(template: AppTemplate) {
  return template.files ?? []
}

function fieldDefaultValue(field: AppTemplateField) {
  return field.default_value ?? ''
}

function normalizeFilePath(path: string) {
  const normalized = path.trim().replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || normalized.startsWith('~')) return ''
  const parts = normalized.split('/')
  if (parts.some((part: string) => !part || part === '.' || part === '..')) return ''
  return parts.join('/')
}

function parentDirectory(path: string) {
  const index = path.lastIndexOf('/')
  return index > 0 ? path.slice(0, index) : ''
}

function languageForPath(path: string) {
  const lower = path.toLowerCase()
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.sql')) return 'sql'
  if (lower.endsWith('.sh') || lower.endsWith('.bash')) return 'shell'
  if (lower.endsWith('.toml')) return 'toml'
  if (lower.endsWith('.md')) return 'markdown'
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript'
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.html')) return 'html'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.xml')) return 'xml'
  if (lower.endsWith('.yml') || lower.endsWith('.yaml') || lower === COMPOSE_PATH) return 'yaml'
  return 'plaintext'
}

function splitTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}
