import { Controller, type Control } from 'react-hook-form'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field'
import type { RunContainerFormValues } from '@/features/docker-containers/model/run-container-schema'

interface CommandSectionProps {
  control: Control<RunContainerFormValues>
}

export function CommandSection({ control }: CommandSectionProps) {
  return (
    <>
      <Controller
        control={control}
        name="commandText"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="run-ctr-cmd">启动命令（CMD）</FieldLabel>
            <FieldContent>
              <Textarea id="run-ctr-cmd" {...field} placeholder={'nginx\n-g\ndaemon off;'} rows={3} />
              <FieldDescription>留空则沿用镜像默认 CMD</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="entrypointLine"
        render={({ field }) => (
          <div className="space-y-2">
            <FieldLabel htmlFor="run-ctr-ep">入口命令（ENTRYPOINT）</FieldLabel>
            <Input id="run-ctr-ep" {...field} placeholder="/docker-entrypoint.sh" />
            <FieldDescription>留空则沿用镜像默认 ENTRYPOINT</FieldDescription>
          </div>
        )}
      />
    </>
  )
}
