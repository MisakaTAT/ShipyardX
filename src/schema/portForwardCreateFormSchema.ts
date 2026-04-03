import { z } from 'zod'

export const portForwardCreateFormSchema = z.object({
  serverId: z.string().min(1, '请选择主机'),
  containerId: z.string().min(1, '请选择容器'),
  containerPort: z.number().int().min(1, '请选择容器端口').max(65535, '端口无效'),
  bindAddress: z.string().min(1, '请选择绑定地址'),
  localPort: z.number().int().min(0, '本地端口不能为负').max(65535, '本地端口不能超过 65535'),
})

export type PortForwardCreateFormValues = z.infer<typeof portForwardCreateFormSchema>

export const portForwardCreateDefaultValues = (): PortForwardCreateFormValues => ({
  serverId: '',
  containerId: '',
  containerPort: 0,
  bindAddress: '127.0.0.1',
  localPort: 0,
})
