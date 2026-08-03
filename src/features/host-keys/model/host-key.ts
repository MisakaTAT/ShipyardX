import type { KnownHostEntry, ServerConfig } from '@/types/app-bindings'

/** 与后端 known_hosts::entry_key 保持一致，否则关联服务器会漏匹配 */
export function hostKeyId(host: string, port: number) {
  return `${host.trim().toLowerCase()}:${port}`
}

export type ProbeState =
  | { status: 'probing' }
  | { status: 'match' }
  | { status: 'mismatch'; fingerprint: string }
  | { status: 'failed'; message: string }

export function matchServers(entry: KnownHostEntry, servers: ServerConfig[]) {
  const id = hostKeyId(entry.host, entry.port)
  return servers.filter((server) => hostKeyId(server.host, server.port) === id)
}

const FINGERPRINT_PATTERN = /^SHA256:[A-Za-z0-9+/]{43}$/

/** russh 输出的是 base64 编码的 SHA256 摘要，去掉了结尾的等号 */
export function isValidFingerprint(value: string) {
  return FINGERPRINT_PATTERN.test(value.trim())
}
