export const intelligenceRequestTimeoutMs = 30_000

export class RequestTimeoutError extends Error {
  constructor(stage: string) {
    super(`${stage} exceeded ${intelligenceRequestTimeoutMs} seconds.`)
    this.name = "RequestTimeoutError"
  }
}

// Stop waiting for an AI or crawler request after its 30-second budget.
export async function withRequestTimeout<T>(operation: Promise<T>, stage: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new RequestTimeoutError(stage)), intelligenceRequestTimeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
