import { randomUUID } from "node:crypto"
import { CliError, EXIT_CODES } from "../errors"
import {
  fetchMobileAccounts,
  fetchMobileBalance,
  fetchMobileTransactions,
  loginMobile,
  type MobileAccount,
} from "../mobile/client"
import { MOBILE_DEFAULT_LANGUAGE } from "../mobile/protocol"
import { loadMobileState, saveMobileState } from "../state"

export interface MobileLoginArgs {
  language?: string
  otp: string
  serial?: string
  username: string
}

function mobileAuthError(profile: string, username?: string): CliError {
  const login = username
    ? `nlbcli --profile ${profile} mobile login --username '${username.replaceAll("'", "'\\''")}' --otp <code>`
    : `nlbcli --profile ${profile} mobile login --username <user> --otp <code>`
  return new CliError(
    EXIT_CODES.authentication,
    `No valid saved mobile session for profile "${profile}". Run \`${login}\` to log in.`
  )
}

function requireMobileState(profile: string) {
  const state = loadMobileState(profile)
  if (!state) {
    throw mobileAuthError(profile)
  }
  return state
}

async function withMobileState<T>(
  profile: string,
  run: (token: string, username: string) => Promise<T>
): Promise<T> {
  const state = requireMobileState(profile)
  try {
    return await run(state.token, state.username)
  } catch (error) {
    if (
      error instanceof CliError &&
      error.exitCode === EXIT_CODES.authentication
    ) {
      throw mobileAuthError(profile, state.username)
    }
    throw error
  }
}

export async function cmdMobileLogin(
  profile: string,
  args: MobileLoginArgs
): Promise<void> {
  const deviceId = loadMobileState(profile)?.deviceId ?? randomUUID()
  const token = await loginMobile({
    deviceId,
    language: args.language ?? MOBILE_DEFAULT_LANGUAGE,
    otp: args.otp,
    serial: args.serial,
    username: args.username,
  })
  saveMobileState(profile, { deviceId, token, username: args.username })
}

async function resolveAccount(
  token: string,
  accountNumber: string,
  language: string
): Promise<MobileAccount> {
  const accounts = await fetchMobileAccounts(token, language)
  const account = accounts.find((item) => item.partija === accountNumber)
  if (!account) {
    throw new CliError(
      EXIT_CODES.arguments,
      `Unknown mobile account "${accountNumber}". Run \`nlbcli mobile accounts\` to list accounts.`
    )
  }
  return account
}

export async function cmdMobileAccounts(
  profile: string,
  language = MOBILE_DEFAULT_LANGUAGE
): Promise<MobileAccount[]> {
  return await withMobileState(profile, (token) =>
    fetchMobileAccounts(token, language)
  )
}

export async function cmdMobileBalance(
  profile: string,
  accountNumber: string,
  language = MOBILE_DEFAULT_LANGUAGE
): Promise<unknown[]> {
  return await withMobileState(profile, async (token) => {
    const account = await resolveAccount(token, accountNumber, language)
    return await fetchMobileBalance(token, account, language)
  })
}

export async function cmdMobileTransactions(
  profile: string,
  accountNumber: string,
  start: string,
  end: string,
  language = MOBILE_DEFAULT_LANGUAGE
): Promise<unknown[]> {
  return await withMobileState(profile, async (token) => {
    const account = await resolveAccount(token, accountNumber, language)
    return await fetchMobileTransactions(token, account, start, end, language)
  })
}
