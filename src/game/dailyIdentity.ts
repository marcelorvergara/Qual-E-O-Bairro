const DAILY_DEVICE_KEY = 'qeb:daily-device:v1'
const LEGACY_DEVICE_KEY = 'qeb:device:v1'
const DAILY_DEVICE_COOKIE = 'qeb_daily_device'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
const DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface CookieStore {
  cookie: string
}

interface PersistentStorage {
  persisted(): Promise<boolean>
  persist(): Promise<boolean>
}

export interface DailyIdentityOptions {
  cookies?: CookieStore
  createId?: () => string
  storage?: Pick<Storage, 'getItem' | 'setItem'>
}

function browserCookies(): CookieStore | undefined {
  return typeof document === 'undefined' ? undefined : document
}

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

function browserPersistentStorage(): PersistentStorage | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.storage
}

function isDeviceId(value: string | null | undefined): value is string {
  return Boolean(value && DEVICE_ID_PATTERN.test(value))
}

function readStorage(
  storage: Pick<Storage, 'getItem'> | undefined,
  key: string,
): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function readCookie(cookies: CookieStore | undefined): string | null {
  if (!cookies) return null
  const prefix = `${DAILY_DEVICE_COOKIE}=`
  const value = cookies.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length)
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function writeIdentity(
  id: string,
  storage: Pick<Storage, 'setItem'> | undefined,
  cookies: CookieStore | undefined,
) {
  try {
    storage?.setItem(DAILY_DEVICE_KEY, id)
  } catch {
    // The cookie remains a recovery path when local storage is unavailable.
  }
  try {
    if (cookies)
      cookies.cookie = `${DAILY_DEVICE_COOKIE}=${encodeURIComponent(id)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax; Secure`
  } catch {
    // The local copy remains usable when cookies are unavailable.
  }
}

export function dailyDeviceId({
  cookies = browserCookies(),
  createId = () => crypto.randomUUID(),
  storage = browserStorage(),
}: DailyIdentityOptions = {}): string {
  const stored = readStorage(storage, DAILY_DEVICE_KEY)
  const cookie = readCookie(cookies)
  const legacy = readStorage(storage, LEGACY_DEVICE_KEY)
  const id = [stored, cookie, legacy].find(isDeviceId) ?? createId()
  writeIdentity(id, storage, cookies)
  return id
}

export async function requestDailyStoragePersistence(
  persistentStorage = browserPersistentStorage(),
): Promise<boolean> {
  if (!persistentStorage) return false
  try {
    if (await persistentStorage.persisted()) return true
    return await persistentStorage.persist()
  } catch {
    return false
  }
}
