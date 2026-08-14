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

/** AppError 的构造入口，用于定位某个 code 是在哪一行被建出来的 */
const ERROR_CTOR =
  /AppError::(?:validation|auth|permission|not_found|conflict|unavailable|timeout|internal|new|wrap)\(\s*"([a-z0-9_.]+)"/g
/** 链式 .param(...) 一般紧跟在构造之后，扫描一个小窗口足够 */
const PARAM_WINDOW_LINES = 8

const rustCodes = new Set()
/** code -> [{ file, line, params }]，每个构造点单独记，漏一处就报一处 */
const rustCtors = new Map()
;(function walkRust(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walkRust(path)
    else if (name.endsWith('.rs')) {
      const text = readFileSync(path, 'utf8')
      for (const m of text.matchAll(CODE_SHAPE)) {
        if (isCode(m[1])) rustCodes.add(m[1])
      }

      const lines = text.split('\n')
      lines.forEach((line, index) => {
        for (const m of line.matchAll(ERROR_CTOR)) {
          const window = lines.slice(index, index + PARAM_WINDOW_LINES).join('\n')
          const params = new Set([...window.matchAll(/\.param\(\s*"(\w+)"/g)].map((hit) => hit[1]))
          if (!rustCtors.has(m[1])) rustCtors.set(m[1], [])
          rustCtors.get(m[1]).push({ file: `${name}:${index + 1}`, params })
        }
      })
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

/**
 * 词条里的 {{占位符}} 必须由后端 .param() 填上，否则前端会原样渲染出 "{{host}}"。
 * 同一个 code 可能有多个构造点，逐个查。
 */
for (const [code, ctors] of rustCtors) {
  const expected = new Set()
  for (const field of ['message', 'action']) {
    const text = base.get(`backend.errors.${code}.${field}`)
    for (const name of placeholders(text)) expected.add(name)
  }
  if (!expected.size) continue

  for (const { file, params } of ctors) {
    const missing = [...expected].filter((name) => !params.has(name))
    if (missing.length) {
      problems.push(`${file}: 构造 "${code}" 时缺少 .param({{${missing.join('}}, {{')}}})，前端会显示原始占位符`)
    }
  }
}

const FRONTEND_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const UI_KEY_SHAPE = /['"`](ui\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)['"`]/g

const usedUiKeys = new Set()
;(function walkFrontend(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (path !== LOCALES_DIR) walkFrontend(path)
    } else if (/\.tsx?$/.test(name)) {
      for (const m of readFileSync(path, 'utf8').matchAll(UI_KEY_SHAPE)) usedUiKeys.add(m[1])
    }
  }
})(FRONTEND_SRC)

for (const key of usedUiKeys) {
  if (!base.has(key)) problems.push(`${BASE_LOCALE}: 源码引用了不存在的词条 "${key}"`)
}
for (const key of base.keys()) {
  if (!key.startsWith('ui.') || usedUiKeys.has(key)) continue
  problems.push(`${BASE_LOCALE}: 词条 "${key}" 没有任何引用`)
}

if (problems.length) {
  console.error(`i18n check failed (${problems.length} problems):`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

console.log(`i18n check passed: ${entries.size} locales, ${base.size} keys each, ${rustCodes.size} backend error codes`)
