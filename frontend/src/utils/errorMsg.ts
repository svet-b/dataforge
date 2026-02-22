import { ApiError } from '@/api/client';

/**
 * Extract a human-readable message from an unknown caught error.
 */
export function errorMsg(e: unknown): string {
  if (e instanceof ApiError) return e.detail;
  if (e instanceof Error) return e.message;
  return String(e);
}
