import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query'
import { toastAppError } from '@/shared/lib/errors'

type InvalidateKeys<TData, TVariables> = QueryKey[] | ((context: { data: TData; variables: TVariables }) => QueryKey[])

interface UseInvalidatingMutationOptions<TData, TVariables = void, TOnMutateResult = unknown> extends Omit<
  UseMutationOptions<TData, unknown, TVariables, TOnMutateResult>,
  'onSuccess' | 'onError'
> {
  invalidate?: InvalidateKeys<TData, TVariables>
  onSuccess?: UseMutationOptions<TData, unknown, TVariables, TOnMutateResult>['onSuccess']
  onError?: UseMutationOptions<TData, unknown, TVariables, TOnMutateResult>['onError']
}

export function useInvalidatingMutation<TData, TVariables = void, TOnMutateResult = unknown>(
  options: UseInvalidatingMutationOptions<TData, TVariables, TOnMutateResult>
): UseMutationResult<TData, unknown, TVariables, TOnMutateResult> {
  const qc = useQueryClient()
  const { invalidate, onSuccess, onError, ...rest } = options

  return useMutation({
    ...rest,
    onSuccess: async (data, variables, onMutateResult, context) => {
      const keys = typeof invalidate === 'function' ? invalidate({ data, variables }) : invalidate

      if (keys?.length) {
        await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })))
      }

      await onSuccess?.(data, variables, onMutateResult, context)
    },
    onError: (error, variables, onMutateResult, context) => {
      if (onError) {
        void onError(error, variables, onMutateResult, context)
        return
      }
      toastAppError(error)
    },
  })
}
