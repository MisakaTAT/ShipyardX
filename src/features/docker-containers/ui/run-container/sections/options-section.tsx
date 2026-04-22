import { Controller, type Control } from 'react-hook-form'
import { FieldDescription, FieldTitle } from '@/shared/ui/field'
import type { RunContainerFormValues } from '@/features/docker-containers/model/run-container-schema'
import { CheckRow } from '../shared'

interface OptionsSectionProps {
  control: Control<RunContainerFormValues>
}

export function OptionsSection({ control }: OptionsSectionProps) {
  return (
    <div className="space-y-2">
      <FieldTitle>其它选项</FieldTitle>
      <Controller
        control={control}
        name="autoRemove"
        render={({ field }) => (
          <CheckRow checked={field.value} onCheckedChange={field.onChange}>
            停止后自动删除容器（--rm）
          </CheckRow>
        )}
      />
      <Controller
        control={control}
        name="privileged"
        render={({ field }) => (
          <CheckRow checked={field.value} onCheckedChange={field.onChange}>
            特权模式，近似主机权限（--privileged）
          </CheckRow>
        )}
      />
      <FieldDescription className="pl-6">
        特权模式会显著扩大容器可访问的主机能力（谨慎启用！）
      </FieldDescription>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Controller
          control={control}
          name="tty"
          render={({ field }) => (
            <CheckRow checked={field.value} onCheckedChange={field.onChange}>
              分配伪终端（-t）
            </CheckRow>
          )}
        />
        <Controller
          control={control}
          name="openStdin"
          render={({ field }) => (
            <CheckRow checked={field.value} onCheckedChange={field.onChange}>
              保持标准输入打开（-i）
            </CheckRow>
          )}
        />
      </div>
    </div>
  )
}
