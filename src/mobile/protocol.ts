import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto"

// Recovered from libSecureImpl.so: webApiKeyReleaseTutunska.
export const WEB_API_SECRET = "8346C8F846734604D9AE5E1D10490814"
export const MOBILE_BASE_URL = "https://mbanking.24x7.com.mk"
export const MOBILE_APP_ID = "Android_3.3.41"
export const MOBILE_CHANNEL = 6
export const MOBILE_DEFAULT_LANGUAGE = "mk"

const IV_LENGTH = 12
const TAG_LENGTH = 16
const GCM_CIPHER = "aes-256-gcm"

/** Bank key transformation: swap the two halves of the secret. */
export function swapHalves(value: string): string {
  const half = Math.floor(value.length / 2)
  return value.slice(half) + value.slice(0, half)
}

export function encryptionKey(secret = WEB_API_SECRET): Buffer {
  return Buffer.from(swapHalves(secret), "utf8")
}

/** AES/GCM request body: base64(iv || ciphertext || tag). */
export function encryptRequest(
  json: string,
  secret = WEB_API_SECRET,
  iv = randomBytes(IV_LENGTH)
): string {
  const cipher = createCipheriv(GCM_CIPHER, encryptionKey(secret), iv)
  const body = Buffer.concat([cipher.update(json, "utf8"), cipher.final()])
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64")
}

export function decryptResponse(
  payload: string,
  secret = WEB_API_SECRET
): string {
  const raw = Buffer.from(payload, "base64")
  if (raw.length <= IV_LENGTH + TAG_LENGTH) {
    throw new Error("Encrypted mobile payload is too short.")
  }
  const iv = raw.subarray(0, IV_LENGTH)
  const tag = raw.subarray(raw.length - TAG_LENGTH)
  const decipher = createDecipheriv(GCM_CIPHER, encryptionKey(secret), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([
    decipher.update(raw.subarray(IV_LENGTH, raw.length - TAG_LENGTH)),
    decipher.final(),
  ]).toString("utf8")
}

export interface AuthenticationHeaderValues {
  authentication: string
  rand: string
  timestamp: string
}

/** UTC timestamp in the bank's format: yyyy-MM-dd HH:mm:ss. */
export function utcTimestamp(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return [
    `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`,
    `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`,
  ].join(" ")
}

/**
 * Authentication header: `1:` plus base64 HMAC-SHA256 of
 * timestamp/methodName/methodType/rand, keyed with the swapped secret.
 */
export function authenticationHeader(
  methodName: string,
  methodType: string,
  now = new Date(),
  rand = randomUUID()
): AuthenticationHeaderValues {
  const timestamp = utcTimestamp(now)
  const payload = [timestamp, methodName, methodType, rand].join("\n")
  const digest = createHmac("sha256", encryptionKey())
    .update(payload, "utf8")
    .digest("base64")
  return { authentication: `1:${digest}`, rand, timestamp }
}

export interface LoginPayloadOptions {
  deviceId: string
  language?: string
  otp: string
  serial?: string
  username: string
}

/** LoginRequest body. Field names follow the bank model classes. */
export function loginPayload(options: LoginPayloadOptions): string {
  return JSON.stringify({
    appId: MOBILE_APP_ID,
    channel_id: MOBILE_CHANNEL,
    deviceInfo: {
      manufacturer: "nlbcli",
      model: "nlbcli",
      os: "Node",
    },
    language: options.language ?? MOBILE_DEFAULT_LANGUAGE,
    mAuthenticationType: "MBankToken",
    mCredentials: {
      afSessionId: "",
      mOTP: options.otp,
      mSerial: options.serial ?? "",
      mUserName: options.username,
    },
    uuid: options.deviceId,
  })
}
