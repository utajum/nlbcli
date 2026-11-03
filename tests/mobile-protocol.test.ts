import { expect, test } from "vitest"
import { mobileDate } from "../src/mobile/client"
import {
  authenticationHeader,
  decryptResponse,
  encryptRequest,
  loginPayload,
  swapHalves,
  WEB_API_SECRET,
} from "../src/mobile/protocol"

const FIXED_IV = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
const FIXED_RAND = "00000000-0000-4000-8000-000000000000"
const FIXED_NOW = new Date("2026-11-03T12:00:00Z")

// Vectors generated with an independent AES-GCM/HMAC implementation.
test("key derivation matches the bank's half swap", () => {
  expect(swapHalves(WEB_API_SECRET)).toBe("D9AE5E1D104908148346C8F846734604")
})

test("request envelope pins the AES-GCM and base64 layout", () => {
  expect(encryptRequest('{"hello":"world"}', WEB_API_SECRET, FIXED_IV)).toBe(
    "AAECAwQFBgcICQoLg3O8Ygj2egBnTnWALwz8+6s1T/QCD9LwplQWCsDbwWEv"
  )
})

test("response decryption reverses the envelope", () => {
  const envelope = encryptRequest('{"ok":true}', WEB_API_SECRET, FIXED_IV)
  expect(decryptResponse(envelope)).toBe('{"ok":true}')
})

test("authentication header pins the HMAC payload and encoding", () => {
  expect(authenticationHeader("Login", "POST", FIXED_NOW, FIXED_RAND)).toEqual({
    authentication: "1:Tng+ofykwPoCShzYckyQSu88dRNw7LPGFmnyE37JNOk=",
    rand: FIXED_RAND,
    timestamp: "2026-11-03 12:00:00",
  })
})

test("login payload uses the bank model field names", () => {
  expect(
    JSON.parse(
      loginPayload({
        deviceId: "device",
        otp: "123456",
        serial: "serial",
        username: "user",
      })
    )
  ).toMatchObject({
    channel_id: 6,
    mAuthenticationType: "MBankToken",
    mCredentials: { mOTP: "123456", mSerial: "serial", mUserName: "user" },
    uuid: "device",
  })
})

test("transaction dates use the bank filter format", () => {
  expect(mobileDate("01.02.2026")).toBe("2026.02.01")
})
