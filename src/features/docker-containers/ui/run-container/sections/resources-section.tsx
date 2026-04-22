import { Controller, type Control } from 'react-hook-form'
import { Input } from '@/shared/ui/input'
import { FieldLabel } from '@/shared/ui/field'
import type { RunContainerFormValues } from '@/features/docker-containers/model/run-container-schema'

interface ResourcesSectionProps {
  control: Control<RunContainerFormValues>
}

export function ResourcesSection({ control }: ResourcesSectionProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Controller
        control={control}
        name="cpuShares"
        render={({ field, fieldState }) => (
          <div className="space-y-2">
            <FieldLabel htmlFor="run-cpu-shares">CPU 权重（shares）</FieldLabel>
            <Input
              id="run-cpu-shares"
              type="number"
              min={0}
              {...field}
              placeholder="默认 1024；0 表示不设置"
              aria-invalid={fieldState.invalid}
              className="font-mono"
            />
          </div>
        )}
      />
      <Controller
        control={control}
        name="cpuQuotaCores"
        render={({ field, fieldState }) => (
          <div className="space-y-2">
            <FieldLabel htmlFor="run-cpu-quota">CPU 上限（核数）</FieldLabel>
            <Input
              id="run-cpu-quota"
              type="number"
              min={0}
              step="0.1"
              {...field}
              placeholder="0 或留空表示不限制"
              aria-invalid={fieldState.invalid}
              className="font-mono"
            />
          </div>
        )}
      />
      <Controller
        control={control}
        name="memoryMb"
        render={({ field, fieldState }) => (
          <div className="space-y-2">
            <FieldLabel htmlFor="run-mem">内存上限（MB）</FieldLabel>
            <Input
              id="run-mem"
              type="number"
              min={0}
              {...field}
              placeholder="0 或留空表示不限制"
              aria-invalid={fieldState.invalid}
              className="font-mono"
            />
          </div>
        )}
      />
    </div>
  )
}
