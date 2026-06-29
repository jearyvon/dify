import { getPublic, postPublic } from '@/service/base'

const CREDITS_CHECK_PATH = '/v1/permission/credits/check'
const CREDITS_DEDUCT_PATH = '/v1/permission/credits/deduct'

type CreditsPermissionResponse = {
  code: number
  data: {
    allowed: boolean
    message: string
  }
}

const requestJkCredits = async <T>(
  method: 'GET' | 'POST',
  path: string,
  body?: { amount: number, biz_id: string },
): Promise<T> => {
  if (method === 'GET')
    return getPublic<T>(path)

  return postPublic<T>(path, { body })
}

export const checkRunPermission = async (): Promise<boolean> => {
  try {
    const res = await requestJkCredits<CreditsPermissionResponse>('GET', CREDITS_CHECK_PATH)
    if (res.code === 200 && res.data.allowed)
      return true
    return false
  }
  catch {
    return false
  }
}

export const deductRun = async (amount: number, bizId: string): Promise<boolean> => {
  try {
    const res = await requestJkCredits<CreditsPermissionResponse>('POST', CREDITS_DEDUCT_PATH, {
      amount,
      biz_id: bizId,
    })
    return res.code === 200 && res.data.allowed
  }
  catch {
    return false
  }
}

export const estimateTokensFromMessageLength = (charLength: number): number => {
  if (charLength <= 0)
    return 1

  const factor = 1.1 + Math.random() * 0.4
  return Math.max(1, Math.round(charLength * factor))
}

export const deductSessionRun = (totalTokens: number | undefined, sessionId?: string) => {
  if (!sessionId || !totalTokens || totalTokens <= 0)
    return

  const bizId = `${sessionId}_${Date.now()}`
  void deductRun(totalTokens, bizId)
}

export const INSUFFICIENT_CREDITS_MESSAGE = '余额不足，请充值后重试'
