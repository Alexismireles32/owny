import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function readJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

export function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const maybeError = (payload as { error?: unknown }).error
    if (typeof maybeError === 'string' && maybeError.trim().length > 0) {
      return maybeError
    }
  }
  return fallback
}

export function isAuthStatus(status: number): boolean {
  return status === 401 || status === 403
}
