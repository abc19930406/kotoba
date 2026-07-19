// Stored in localStorage, deliberately never in Dexie/IndexedDB — this keeps
// it structurally excluded from exportBackup() (which only ever reads
// db.settings and other Dexie tables), per the security requirement that the
// passcode must never be included in a backup file.
const DAILY_PASSCODE_STORAGE_KEY = 'kotoba.dailyPasscode'

export function getDailyPasscode(): string {
  return localStorage.getItem(DAILY_PASSCODE_STORAGE_KEY) ?? ''
}

export function setDailyPasscode(value: string): void {
  if (value === '') {
    localStorage.removeItem(DAILY_PASSCODE_STORAGE_KEY)
    return
  }
  localStorage.setItem(DAILY_PASSCODE_STORAGE_KEY, value)
}
