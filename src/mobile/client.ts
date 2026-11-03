import { BankHttpError, CliError, EXIT_CODES } from "../errors"
import {
  authenticationHeader,
  loginPayload,
  MOBILE_BASE_URL,
  MOBILE_DEFAULT_LANGUAGE,
} from "./protocol"

const IDENTITY_API = `${MOBILE_BASE_URL}/nlb-ret/IdentityAPI`
export const LOGIN_URL = `${IDENTITY_API}/api/v1/identity/login`
export const ASSETS_URL = `${IDENTITY_API}/api/v1/info/assets`
export const SECURE_URL = `${MOBILE_BASE_URL}/nlb-ret/InfoAPI/api/v1.0/dynamic/get-secure`
const REQUEST_TIMEOUT_MS = 15_000
const BANK_DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/

export interface MobileAccount {
  accType?: string
  availableBalance?: number
  balance?: number
  partija: string
  status?: string
  valuta?: string
}

export interface MobileLoginOptions {
  deviceId: string
  language?: string
  otp: string
  serial?: string
  username: string
}

export interface MobileAccountRef {
  accType?: string
  partija: string
}

async function mobileFetch(url: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new CliError(
      EXIT_CODES.network,
      "Unable to reach NLB. Check your connection and try again."
    )
  }
  if (response.status === 401 || response.status === 403) {
    throw new CliError(
      EXIT_CODES.authentication,
      "NLB mobile session is missing or expired."
    )
  }
  if (response.status >= 400) {
    throw new BankHttpError(response.status)
  }
  return response
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new CliError(
      EXIT_CODES.bankResponse,
      "NLB returned an invalid mobile response."
    )
  }
}

function bearer(token: string, language: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    lang: language,
  }
}

export async function loginMobile(
  options: MobileLoginOptions
): Promise<string> {
  const auth = authenticationHeader("Login", "POST")
  const response = await mobileFetch(LOGIN_URL, {
    method: "POST",
    headers: {
      Authentication: auth.authentication,
      "Content-Type": "application/json",
      Rand: auth.rand,
      Timestamp: auth.timestamp,
    },
    body: loginPayload(options),
  })
  const data = (await readJson(response)) as Record<string, unknown>
  const token = [data.token, data.userToken].find(
    (value): value is string => typeof value === "string" && value.length > 0
  )
  if (!token) {
    const message = [
      data.errorMessage,
      data.mErrorMessage,
      data.error_message,
      data.message,
    ].find(
      (value): value is string => typeof value === "string" && value.length > 0
    )
    throw new CliError(
      EXIT_CODES.authentication,
      `Mobile login failed: ${message ?? "no token returned"}.`
    )
  }
  return token
}

export async function fetchMobileAccounts(
  token: string,
  language = MOBILE_DEFAULT_LANGUAGE
): Promise<MobileAccount[]> {
  const response = await mobileFetch(ASSETS_URL, {
    method: "GET",
    headers: bearer(token, language),
  })
  const data = (await readJson(response)) as {
    getAssetsResponse?: {
      allAssetsResponseBody?: { listOfAssets?: MobileAccount[] }
    }
  }
  return data.getAssetsResponse?.allAssetsResponseBody?.listOfAssets ?? []
}

async function postSecure(
  token: string,
  body: Record<string, unknown>,
  language: string
): Promise<unknown[]> {
  const response = await mobileFetch(SECURE_URL, {
    method: "POST",
    headers: bearer(token, language),
    body: JSON.stringify(body),
  })
  const data = await readJson(response)
  if (!Array.isArray(data)) {
    throw new CliError(
      EXIT_CODES.bankResponse,
      "NLB returned an unrecognized mobile response."
    )
  }
  return data
}

function isCardAccount(account: MobileAccountRef): boolean {
  return account.partija.includes("/")
}

export async function fetchMobileBalance(
  token: string,
  account: MobileAccountRef,
  language = MOBILE_DEFAULT_LANGUAGE
): Promise<unknown[]> {
  return await postSecure(
    token,
    {
      action: isCardAccount(account)
        ? "account-details-cms"
        : "account-details-checking",
      transactionFilterRequest: {
        accountId: account.partija,
        accountType: account.accType,
      },
    },
    language
  )
}

/** Convert dd.mm.yyyy to the bank's yyyy.MM.dd filter format. */
export function mobileDate(value: string): string {
  const match = BANK_DATE.exec(value)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value
}

export async function fetchMobileTransactions(
  token: string,
  account: MobileAccountRef,
  start: string,
  end: string,
  language = MOBILE_DEFAULT_LANGUAGE
): Promise<unknown[]> {
  return await postSecure(
    token,
    {
      action: isCardAccount(account)
        ? "account-transactions-cms"
        : "account-transactions-checking",
      jsonRequest: {
        filter: {
          accountId: account.partija,
          accountType: account.accType,
          dateFrom: mobileDate(start),
          dateTo: mobileDate(end),
        },
        sorter: "date",
      },
    },
    language
  )
}
