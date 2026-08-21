interface ApiErrorLike {
  message?: string
  response?: {
    status?: number
    data?: { error?: string; message?: string }
  }
}

interface ErrorMessageOptions {
  /** 按 HTTP 状态码定制的提示 */
  statusMessages?: Record<number, string>
  /** 兜底提示 */
  fallback: string
  /** 服务端返回体中优先读取的字段 */
  preferField?: 'error' | 'message'
}

/**
 * 统一解析接口错误提示：服务端错误信息 > 状态码提示 > 网络错误 > 兜底提示
 */
export const getApiErrorMessage = (error: unknown, options: ErrorMessageOptions) => {
  const err = (error ?? {}) as ApiErrorLike
  const { statusMessages = {}, fallback, preferField = 'error' } = options

  const serverMessage = err.response?.data?.[preferField]
  if (serverMessage) return serverMessage

  const status = err.response?.status
  if (status !== undefined && statusMessages[status]) return statusMessages[status]

  if (err.message?.includes('Network Error')) return '网络连接失败，请检查网络'

  return fallback
}

/** 用于 console.error 的精简错误结构 */
export const describeApiError = (error: unknown) => {
  const err = (error ?? {}) as ApiErrorLike
  return {
    message: err.message,
    response: err.response?.data,
    status: err.response?.status,
  }
}
