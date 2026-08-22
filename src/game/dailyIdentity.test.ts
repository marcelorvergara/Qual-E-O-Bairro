import { describe, expect, it, vi } from 'vitest'
import { dailyDeviceId, requestDailyStoragePersistence } from './dailyIdentity'

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

class MemoryCookies {
  private values = new Map<string, string>()

  get cookie() {
    return [...this.values.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')
  }

  set cookie(value: string) {
    const [pair] = value.split(';')
    const separator = pair.indexOf('=')
    this.values.set(pair.slice(0, separator), pair.slice(separator + 1))
  }
}

const firstId = 'dde83021-b409-4cae-b64e-6e0abb8fe118'
const secondId = '635f0f81-15a0-4883-a9ca-a4419e0e4609'

describe('daily identity', () => {
  it('migrates the existing device ID and mirrors it in the daily stores', () => {
    const storage = new MemoryStorage()
    const cookies = new MemoryCookies()
    storage.setItem('qeb:device:v1', firstId)

    expect(dailyDeviceId({ storage, cookies })).toBe(firstId)
    expect(storage.getItem('qeb:daily-device:v1')).toBe(firstId)
    expect(cookies.cookie).toContain(`qeb_daily_device=${firstId}`)
  })

  it('restores the daily ID from the cookie after local storage is cleared', () => {
    const storage = new MemoryStorage()
    const cookies = new MemoryCookies()
    dailyDeviceId({ cookies, createId: () => firstId, storage })
    const clearedStorage = new MemoryStorage()

    expect(dailyDeviceId({ cookies, storage: clearedStorage })).toBe(firstId)
    expect(clearedStorage.getItem('qeb:daily-device:v1')).toBe(firstId)
  })

  it('creates a new UUID only when no daily or legacy identity is available', () => {
    const storage = new MemoryStorage()
    const cookies = new MemoryCookies()

    expect(dailyDeviceId({ cookies, createId: () => secondId, storage })).toBe(
      secondId,
    )
  })

  it('keeps the stored daily identity when the cookie differs', () => {
    const storage = new MemoryStorage()
    const cookies = new MemoryCookies()
    storage.setItem('qeb:daily-device:v1', firstId)
    cookies.cookie = `qeb_daily_device=${secondId}`

    expect(dailyDeviceId({ cookies, storage })).toBe(firstId)
    expect(cookies.cookie).toContain(`qeb_daily_device=${firstId}`)
  })

  it('requests persistent browser storage only when it is not already granted', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    const persisted = vi.fn().mockResolvedValue(false)

    await expect(
      requestDailyStoragePersistence({ persisted, persist }),
    ).resolves.toBe(true)
    expect(persist).toHaveBeenCalledOnce()
  })

  it('does not fail when persistent browser storage is unavailable', async () => {
    await expect(requestDailyStoragePersistence()).resolves.toBe(false)
  })
})
