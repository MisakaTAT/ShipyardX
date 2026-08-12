#!/usr/bin/env node
/**
 * 校验词条文件：
 *  1. 三份语言的 key 集合必须完全一致（缺 key 会在运行时静默回退，不查出来看不见）
 *  2. 同一个 key 的插值变量必须一致（漏写 {{version}} 会显示成空白）
 *  3. 没有空字符串词条
 * 用法：node scripts/check-i18n.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app', 'i18n', 'locales')
const BASE_LOCALE = 'zh-CN'

function flatten(value, prefix = '', out = new Map()) {
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item, path, out)
    else out.set(path, item)
  }
  return out
}

const placeholders = (text) =>
  new Set(typeof text === 'string' ? [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]) : [])

const files = readdirSync(LOCALES_DIR).filter((name) => name.endsWith('.json'))
const entries = new Map(
  files.map((name) => [name.replace(/\.json$/, ''), flatten(JSON.parse(readFileSync(join(LOCALES_DIR, name), 'utf8')))])
)

const base = entries.get(BASE_LOCALE)
if (!base) {
  console.error(`missing base locale: ${BASE_LOCALE}.json`)
  process.exit(1)
}

const problems = []

for (const [key, text] of base) {
  if (typeof text === 'string' && !text.trim()) problems.push(`${BASE_LOCALE}: empty value for "${key}"`)
}

for (const [locale, map] of entries) {
  if (locale === BASE_LOCALE) continue

  for (const key of base.keys()) {
    if (!map.has(key)) problems.push(`${locale}: missing "${key}"`)
  }
  for (const key of map.keys()) {
    if (!base.has(key)) problems.push(`${locale}: extra "${key}" (not in ${BASE_LOCALE})`)
  }
  for (const [key, text] of map) {
    if (typeof text === 'string' && !text.trim()) problems.push(`${locale}: empty value for "${key}"`)
    if (!base.has(key)) continue
    const expected = placeholders(base.get(key))
    const actual = placeholders(text)
    const missing = [...expected].filter((name) => !actual.has(name))
    const unknown = [...actual].filter((name) => !expected.has(name))
    if (missing.length) problems.push(`${locale}: "${key}" is missing {{${missing.join('}}, {{')}}}`)
    if (unknown.length) problems.push(`${locale}: "${key}" has unexpected {{${unknown.join('}}, {{')}}}`)
  }
}

const RUST_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'src')

const CODE_SHAPE = /"([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)"/g

const NOT_A_CODE = [
  /\.(yml|yaml|json|toml|sock|service|log|txt|md|rs|env|png|tar|gz|conf)$/,
  /^com\./,
  /^desktop\.docker\./,
]

const CODE_ALLOWLIST = new Set(['serde.json', 'serde.yaml'])

const isCode = (value) =>
  CODE_ALLOWLIST.has(value) || (!NOT_A_CODE.some((pattern) => pattern.test(value)) && value !== 'example.com')

const rustCodes = new Set()
;(function walkRust(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walkRust(path)
    else if (name.endsWith('.rs')) {
      const text = readFileSync(path, 'utf8')
      for (const m of text.matchAll(CODE_SHAPE)) {
        if (isCode(m[1])) rustCodes.add(m[1])
      }
    }
  }
})(RUST_SRC)

/**
 * 后端 code 与词条的对应是逐字的，不需要映射表：
 *   错误   → backend.errors.<code>.message
 *   非错误 → backend.<code>
 */
for (const code of rustCodes) {
  if (base.has(`backend.errors.${code}.message`) || base.has(`backend.${code}`)) continue
  problems.push(`${BASE_LOCALE}: 后端 "${code}" 没有对应词条（backend.errors.${code}.message 或 backend.${code}）`)
}

for (const key of base.keys()) {
  if (!key.startsWith('backend.errors.')) continue
  const code = key.slice('backend.errors.'.length).replace(/\.(message|action)$/, '')
  if (code === 'unknown' || rustCodes.has(code)) continue
  problems.push(`${BASE_LOCALE}: 词条 "backend.errors.${code}" 在后端已不存在`)
}

if (problems.length) {
  console.error(`i18n check failed (${problems.length} problems):`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

console.log(`i18n check passed: ${entries.size} locales, ${base.size} keys each, ${rustCodes.size} backend error codes`)
