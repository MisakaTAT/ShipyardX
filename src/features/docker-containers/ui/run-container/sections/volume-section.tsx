import { Plus, Trash2 } from 'lucide-react'
import { Controller, useFieldArray, type Control } from 'react-hook-form'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { FieldTitle } from '@/shared/ui/field'
import type { RunContainerFormValues } from '@/features/docker-containers/model/run-container-schema'
import { CheckRow } from '@/features/docker-containers/ui/run-container/shared'

interface VolumeSectionProps {
  control: Control<RunContainerFormValues>
}

function emptyVolume(): RunContainerFormValues['volumes'][number] {
  return { hostPath: '', containerPath: '', readOnly: false }
}

export function VolumeSection({ control }: VolumeSectionProps) {
  const {
    fields,
    append,
    remove,
  } = useFieldArray({ control, name: 'volumes' })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldTitle>数据卷</FieldTitle>
        <Button type="button" variant="ghost" className="gap-1 px-2" onClick={() => append(emptyVolume())}>
          <Plus className="size-3" />
          添加挂载
        </Button>
      </div>
      {fields.map((row, i) => (
        <div
          key={row.id}
          className="flex flex-row items-center gap-2 rounded-lg border border-border bg-muted p-2"
        >
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
            <Controller
              control={control}
              name={`volumes.${i}.hostPath`}
              render={({ field, fieldState }) => (
                <Input
                  placeholder="主机目录 /data/app"
                  {...field}
                  aria-invalid={fieldState.invalid}
                  className="font-mono"
                />
              )}
            />
            <Controller
              control={control}
              name={`volumes.${i}.containerPath`}
              render={({ field, fieldState }) => (
                <Input
                  placeholder="容器内路径 var/www"
                  {...field}
                  aria-invalid={fieldState.invalid}
                  className="font-mono"
                />
              )}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Controller
              control={control}
              name={`volumes.${i}.readOnly`}
              render={({ field }) => (
                <CheckRow checked={field.value} onCheckedChange={field.onChange}>
                  只读
                </CheckRow>
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-red-500"
              onClick={() => remove(i)}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
