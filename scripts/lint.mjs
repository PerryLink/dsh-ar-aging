#!/usr/bin/env node
/** Metadata and package-surface lint for dsh-ar-aging. No network, no install. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const read = (file) => readFileSync(file, 'utf8')
const pkg = JSON.parse(read('package.json'))
const problems = []
const check = (ok, message) => {
  if (!ok) problems.push(message)
}

check(pkg.name === 'dsh-ar-aging', `package name must be dsh-ar-aging, got ${pkg.name}`)
check(/^0\.1\.0-alpha\.\d+$/.test(pkg.version), `unexpected version ${pkg.version}`)
check(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'dsh.bundle.patch missing')
check(!pkg.dsh?.client, 'this package must not declare a client bundle')
check(existsSync('cordis.patch.yml'), 'cordis.patch.yml is missing')
check(pkg.engines?.node === '>=24.9.0 <25', 'engines.node must be >=24.9.0 <25')
check(pkg.engines?.dsh === '>=0.2.1-rc.3 <0.4.0', 'engines.dsh must be >=0.2.1-rc.3 <0.4.0')
check(Object.keys(pkg.dependencies ?? {}).length === 0, 'dsh-ar-aging must have no runtime dependencies')

const demo = pkg.dsh?.demo
check(Boolean(demo), 'dsh.demo is missing')
if (demo) {
  for (const key of ['sample', 'expect', 'screenshot']) {
    check(existsSync(demo[key]), `dsh.demo.${key} does not exist: ${demo[key]}`)
  }
  check(typeof demo.prompt === 'string' && demo.prompt.length > 0, 'dsh.demo.prompt is missing')
  check(demo.network === false, 'dsh.demo.network must be false')
  check(Array.isArray(demo.external) && demo.external.length === 0, 'dsh.demo.external must be empty')
  check(Array.isArray(demo.reads) && demo.reads.length > 0, 'dsh.demo.reads is missing')
  check(Array.isArray(demo.writes) && demo.writes.length > 0, 'dsh.demo.writes is missing')
  const sampleSize = existsSync(demo.sample) ? statSync(demo.sample).size : 0
  check(sampleSize > 0 && sampleSize <= 500 * 1024, `sample must be <= 500 KB, got ${sampleSize}`)
}

const files = pkg.files ?? []
for (const entry of [
  'samples',
  'docs/assets',
  'TROUBLESHOOTING.md',
  'README.md',
  'README-zh.md',
  'README-es.md',
  'README-pt.md',
  'README-hi.md',
  'LICENSE',
  'NOTICE',
]) {
  check(files.includes(entry), `files[] must include ${entry}`)
}

const readmeZh = read('README-zh.md')
const readme = read('README.md')
const troubleshooting = read('TROUBLESHOOTING.md')
for (const [label, text, patterns] of [
  [
    'README-zh',
    readmeZh,
    [/一句话/, /适合[\s\S]*不适合/, /## 输入/, /## 输出/, /## 示例/, /## 权限/, /^#{2,3}\s*FAQ/m, new RegExp(pkg.version.replace(/\./g, '\\.'))],
  ],
  [
    'README',
    readme,
    [/One-liner/i, /Fit/i, /## Input/i, /## Output/i, /## Example/i, /## Permissions/i, /FAQ/i, new RegExp(pkg.version.replace(/\./g, '\\.'))],
  ],
]) {
  for (const pattern of patterns) check(pattern.test(text), `${label} is missing section matching ${pattern}`)
}
for (const pattern of [/读[:：]/, /写[:：]/, /联网[:：]/, /外部系统[:：]/]) {
  check(pattern.test(readmeZh), `README-zh must declare ${pattern}`)
}
check(demo?.prompt && readmeZh.includes(demo.prompt.slice(0, 12)), 'README-zh must contain dsh.demo.prompt')
check(/R0/.test(readmeZh) && /R1/.test(readmeZh), 'README-zh must mark R0/R1 risk levels')

const REQUIRED_CODES = ['E_AR_CSV_ROW', 'E_AR_DATE_INVALID', 'E_AR_AMOUNT', 'E_AR_PATH_INVALID']
const troubleCodes = new Set([...troubleshooting.matchAll(/\bE_AR_[A-Z0-9_]+\b/g)].map((match) => match[0]))
for (const code of REQUIRED_CODES) {
  check(troubleCodes.has(code), `TROUBLESHOOTING must document ${code}`)
  check(readmeZh.includes(code) || readme.includes(code), `README must mention ${code}`)
}
check((troubleshooting.match(/症状/g) ?? []).length >= 3, 'TROUBLESHOOTING needs symptom blocks')
check((troubleshooting.match(/原因/g) ?? []).length >= 3, 'TROUBLESHOOTING needs cause blocks')
check((troubleshooting.match(/动作/g) ?? []).length >= 3, 'TROUBLESHOOTING needs action blocks')

const srcFiles = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.ts')) srcFiles.push(full)
  }
}
walk('src')
const source = srcFiles.map(read).join('\n')
for (const code of REQUIRED_CODES) check(source.includes(code), `src must define ${code}`)
check(
  !/(^|[^\w.])(fetch\s*\(|axios|http\.request|https\.request|net\.connect|new WebSocket|undici)/.test(source),
  'src must not contain network calls',
)

const testFiles = readdirSync('test').filter((name) => name.endsWith('.test.mjs'))
check(testFiles.length >= 10, `test/ must contain >= 10 *.test.mjs files, got ${testFiles.length}`)
const testSource = testFiles.map((name) => read(path.join('test', name))).join('\n')
const testCount = (testSource.match(/^test\(/gm) ?? []).length
check(testCount >= 10, `test/ must contain >= 10 test cases, got ${testCount}`)

const screenshots = JSON.parse(read('screenshots.json'))
check(Array.isArray(screenshots) && screenshots.length > 0, 'screenshots.json must contain at least one entry')
check(
  screenshots.some((entry) => entry.path && entry.command && entry.run_at && entry.output_sha256),
  'screenshots.json needs path + command + run_at + output_sha256',
)
check(existsSync('docs/assets/quickstart.png'), 'docs/assets/quickstart.png is missing')
check(existsSync('LICENSE') && existsSync('NOTICE'), 'LICENSE/NOTICE are missing')
check(existsSync('samples/quickstart/expected/result.json'), 'golden expected/result.json is missing')

if (problems.length > 0) {
  for (const problem of problems) console.error(`lint: ${problem}`)
  process.exit(1)
}
console.log(`lint ok: ${srcFiles.length} source files, ${testFiles.length} test files / ${testCount} tests, ${files.length} published entries`)
