import { Controller, type Control } from 'react-hook-form'
import { Input } from '@/shared/ui/input'
import { Field, FieldLabel, FieldTitle } from '@/shared/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type { RunContainerFormValues } from '@/features/docker-containers/model/run-container-schema'

interface RestartSectionProps {
  control: Control<RunContainerFormValues>
  restartPolicy: RunContainerFormValues['restartPolicy']
}

const RESTART_OPTIONS = [
  { value: 'no', label: '不自动重启' },
  { value: 'always', label: '始终重启' },
  { value: 'unless-stopped', label: '除非已手动停止' },
  { value: 'on-failure', label: '非零退出时重启' },
] as const

export function RestartSection({ control, restartPolicy }: RestartSectionProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Controller
        control={control}
        name="restartPolicy"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-2">
            <FieldTitle>重启策略</FieldTitle>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger aria-invalid={fieldState.invalid}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {RESTART_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      />
      {restartPolicy === 'on-failure' ? (
        <Controller
          control={control}
          name="restartMaxRetry"
          render={({ field, fieldState }) => (
            <div className="space-y-2">
              <FieldLabel htmlFor="run-restart-max">最大重试次数（on-failure）</FieldLabel>
              <Input
                id="run-restart-max"
                type="number"
                min={0}
                {...field}
                aria-invalid={fieldState.invalid}
                className="font-mono"
              />
            </div>
          )}
        />
      ) : null}
    </div>
  )
}
