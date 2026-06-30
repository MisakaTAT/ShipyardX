import { useCallback, useEffect, useRef, useState } from 'react'

type Updater<T> = T | ((current: T) => T)

interface UseSavedDraftOptions<T> {
  isEqual?: (left: T, right: T) => boolean
}

function resolveUpdater<T>(current: T, next: Updater<T>) {
  return typeof next === 'function' ? (next as (value: T) => T)(current) : next
}

export function useSavedDraft<T>(savedValue: T, options?: UseSavedDraftOptions<T>) {
  const isEqualRef = useRef(options?.isEqual ?? Object.is)
  const [saved, setSaved] = useState(savedValue)
  const [draft, setDraftState] = useState(savedValue)

  isEqualRef.current = options?.isEqual ?? Object.is

  useEffect(() => {
    if (isEqualRef.current(savedValue, saved)) return
    setSaved(savedValue)
    setDraftState(savedValue)
  }, [saved, savedValue])

  const setDraft = useCallback((next: Updater<T>) => {
    setDraftState((current) => resolveUpdater(current, next))
  }, [])

  const replaceSaved = useCallback((next: T) => {
    setSaved(next)
    setDraftState(next)
  }, [])

  const resetDraft = useCallback(() => {
    setDraftState(saved)
  }, [saved])

  return {
    saved,
    draft,
    setDraft,
    replaceSaved,
    resetDraft,
    isDirty: !isEqualRef.current(saved, draft),
  }
}
