import { describe, expect, it } from 'vitest'
import { explainerKey, loadExplainer, saveExplainer } from './explainer'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() {
    return this.values.size
  }
  clear() {
    this.values.clear()
  }
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.values.delete(key)
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('explainer cache', () => {
  it('round-trips a body under the bairro code', () => {
    const storage = new MemoryStorage()
    saveExplainer('001', 'Texto do bairro.', storage)
    expect(loadExplainer('001', storage)).toBe('Texto do bairro.')
    expect(storage.getItem(explainerKey('001'))).toBe(
      JSON.stringify({ body: 'Texto do bairro.' }),
    )
  })

  it.each(['{bad json', 'null', '{"body":3}', '{"body":""}'])(
    'drops a corrupt entry: %s',
    (value) => {
      const storage = new MemoryStorage()
      storage.setItem(explainerKey('001'), value)
      expect(loadExplainer('001', storage)).toBeNull()
      expect(storage.length).toBe(0)
    },
  )

  it('returns null when storage rejects both reads and cleanup', () => {
    const storage = {
      getItem: () => {
        throw new Error('Storage disabled')
      },
      removeItem: () => {
        throw new Error('Storage disabled')
      },
    } as unknown as Storage
    expect(loadExplainer('001', storage)).toBeNull()
  })
})
