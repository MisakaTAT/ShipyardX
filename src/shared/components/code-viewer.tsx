import { lazy, Suspense, type ComponentProps } from 'react'

/** Monaco 只在查看 inspect / compose 时用得上，延迟加载避免进首屏 chunk */
const MonacoEditor = lazy(() => import('@/shared/components/monaco-editor'))

type CodeViewerProps = ComponentProps<typeof MonacoEditor>

function EditorLoading() {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">初始化编辑器…</div>
}

export function CodeViewer(props: CodeViewerProps) {
  return (
    <Suspense fallback={<EditorLoading />}>
      <MonacoEditor loading={<EditorLoading />} theme="vs-dark" {...props} />
    </Suspense>
  )
}
