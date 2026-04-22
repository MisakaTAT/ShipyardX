import { Controller, type Control } from 'react-hook-form'
import { Textarea } from '@/shared/ui/textarea'
import { Field, FieldContent, FieldError, FieldLabel } from '@/shared/ui/field'
import type { RunContainerFormValues } from '@/features/docker-containers/model/run-container-schema'

interface EnvLabelsSectionProps {
  control: Control<RunContainerFormValues>
}

export function EnvLabelsSection({ control }: EnvLabelsSectionProps) {
  return (
    <>
      <Controller
        control={control}
        name="labelText"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="run-ctr-labels">容器标签（Labels）</FieldLabel>
            <FieldContent>
              <Textarea
                id="run-ctr-labels"
                {...field}
                placeholder={'app=ShipyardX'}
                rows={3}
                className="min-h-[72px] font-mono"
              />
              <FieldError errors={[fieldState.error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="envText"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="run-ctr-env">环境变量</FieldLabel>
            <FieldContent>
              <Textarea
                id="run-ctr-env"
                {...field}
                placeholder={'TZ=Asia/Shanghai'}
                rows={4}
                className="min-h-[72px] font-mono disabled:cursor-not-allowed disabled:opacity-50"
              />
              <FieldError errors={[fieldState.error]} />
            </FieldContent>
          </Field>
        )}
      />
    </>
  )
}
