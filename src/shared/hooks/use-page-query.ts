import { useCallback, useEffect, useMemo } from 'react'
import { useLocation, useSearch } from 'wouter'

/**
 * 页面级筛选词与「新建」意图都从 URL 读取，命令面板只负责跳转，不需要跨页共享状态。
 * new=1 是一次性的：消费后立刻抹掉，否则来回切页会反复弹出创建对话框。
 */
export function usePageQuery(path: string, onCreateNew?: () => void) {
  const search = useSearch()
  const [, navigate] = useLocation()

  const { query, createNew } = useMemo(() => {
    const params = new URLSearchParams(search)
    return { query: params.get('q') ?? '', createNew: params.get('new') === '1' }
  }, [search])

  const clearQuery = useCallback(() => navigate(path, { replace: true }), [navigate, path])

  useEffect(() => {
    if (!createNew) return
    onCreateNew?.()
    navigate(path, { replace: true })
  }, [createNew, onCreateNew, navigate, path])

  return { query, clearQuery }
}
