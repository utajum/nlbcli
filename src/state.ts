import fs from "node:fs"
import path from "node:path"
import { PROFILES_DIR } from "./constants"

const profileStart = /^[a-zA-Z0-9]/
const invalidProfileCharacter = /[^a-zA-Z0-9._-]/
const sessionWriteFlags =
  // biome-ignore lint/suspicious/noBitwiseOperators: POSIX open flags are combined with bitwise OR.
  fs.constants.O_WRONLY |
  fs.constants.O_CREAT |
  fs.constants.O_TRUNC |
  fs.constants.O_NOFOLLOW
// biome-ignore lint/suspicious/noBitwiseOperators: POSIX open flags are combined with bitwise OR.
const sessionReadFlags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW

export function validateProfile(profile: string): string {
  if (!profileStart.test(profile) || invalidProfileCharacter.test(profile)) {
    throw new Error(
      "Invalid profile name. Start with a letter or digit and use only letters, digits, dots, underscores, or hyphens."
    )
  }
  return profile
}

export function getSessionFile(profile: string): string {
  return path.join(PROFILES_DIR, validateProfile(profile), "session.json")
}

export interface MobileState {
  deviceId: string
  token: string
  username: string
}

export function getMobileFile(profile: string): string {
  return path.join(PROFILES_DIR, validateProfile(profile), "mobile.json")
}

function checkProfileDirectory(directory: string): void {
  if (!fs.lstatSync(directory).isDirectory()) {
    throw new Error(
      "Profile directory must be a directory, not a symbolic link."
    )
  }
}

export function saveCookies(
  profile: string,
  cookieHeader: string,
  username: string
): void {
  const sessionFile = getSessionFile(profile)
  const directory = path.dirname(sessionFile)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  checkProfileDirectory(directory)
  fs.chmodSync(directory, 0o700)
  const file = fs.openSync(sessionFile, sessionWriteFlags, 0o600)
  try {
    fs.fchmodSync(file, 0o600)
    fs.writeFileSync(file, JSON.stringify({ cookie: cookieHeader, username }))
  } finally {
    fs.closeSync(file)
  }
}

export function saveMobileState(profile: string, state: MobileState): void {
  const mobileFile = getMobileFile(profile)
  const directory = path.dirname(mobileFile)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  checkProfileDirectory(directory)
  fs.chmodSync(directory, 0o700)
  const file = fs.openSync(mobileFile, sessionWriteFlags, 0o600)
  try {
    fs.fchmodSync(file, 0o600)
    fs.writeFileSync(file, JSON.stringify(state))
  } finally {
    fs.closeSync(file)
  }
}

export function loadMobileState(profile: string): MobileState | null {
  const mobileFile = getMobileFile(profile)
  if (!fs.existsSync(path.dirname(mobileFile))) {
    return null
  }
  checkProfileDirectory(path.dirname(mobileFile))
  try {
    const file = fs.openSync(mobileFile, sessionReadFlags)
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf-8"))
      return typeof data?.token === "string" &&
        data.token.trim() &&
        typeof data?.deviceId === "string" &&
        data.deviceId.trim()
        ? {
            deviceId: data.deviceId,
            token: data.token,
            username: typeof data.username === "string" ? data.username : "",
          }
        : null
    } finally {
      fs.closeSync(file)
    }
  } catch {
    return null
  }
}

export function loadState(
  profile: string
): { cookie: string; username: string } | null {
  const sessionFile = getSessionFile(profile)
  if (!fs.existsSync(path.dirname(sessionFile))) {
    return null
  }
  checkProfileDirectory(path.dirname(sessionFile))
  try {
    const file = fs.openSync(sessionFile, sessionReadFlags)
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf-8"))
      return typeof data?.cookie === "string" && data.cookie.trim()
        ? {
            cookie: data.cookie,
            username: typeof data.username === "string" ? data.username : "",
          }
        : null
    } finally {
      fs.closeSync(file)
    }
  } catch {
    return null
  }
}
