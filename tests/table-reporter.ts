import type { Reporter, TestCase } from 'vitest/node'

interface Row {
  result: 'PASS' | 'FAIL' | 'SKIP'
  area: string
  check: string
}

/**
 * Prints every test as one row of a pass/fail table after the run, grouped by describe block.
 * Used by the emulator suites so a reviewer can read what was proven at a glance.
 */
export default class TableReporter implements Reporter {
  private rows: Row[] = []

  onTestCaseResult(testCase: TestCase): void {
    const state = testCase.result().state
    const parts = testCase.fullName.split(' > ')
    this.rows.push({
      result: state === 'passed' ? 'PASS' : state === 'failed' ? 'FAIL' : 'SKIP',
      area: parts.length > 1 ? parts.slice(0, -1).join(' / ') : '',
      check: parts.at(-1) ?? testCase.name,
    })
  }

  onTestRunEnd(): void {
    if (this.rows.length === 0) return
    const areaWidth = Math.max(4, ...this.rows.map((r) => r.area.length))
    const line = '-'.repeat(8 + areaWidth + 3 + 70)
    const out: string[] = ['', line, `Result | ${'Area'.padEnd(areaWidth)} | Check`, line]
    for (const r of this.rows)
      out.push(`${r.result.padEnd(6)} | ${r.area.padEnd(areaWidth)} | ${r.check}`)
    const passed = this.rows.filter((r) => r.result === 'PASS').length
    const failed = this.rows.filter((r) => r.result === 'FAIL').length
    out.push(line, `${passed} passed, ${failed} failed, ${this.rows.length} total`, '')
    process.stdout.write(out.join('\n') + '\n')
  }
}
