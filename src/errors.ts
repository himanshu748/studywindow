import { z } from 'zod';
import { ErrorCode, Failure } from './schemas.js';
export class StudyError extends Error {
  constructor(
    public readonly code: z.infer<typeof ErrorCode>,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
  }
}
export function failure(error: unknown): z.infer<typeof Failure> {
  if (error instanceof StudyError)
    return {
      ok: false,
      error: { code: error.code, message: error.message, retryable: error.retryable },
    };
  if (error instanceof z.ZodError)
    return {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Input does not match the supported tool contract.',
        retryable: false,
      },
    };
  return {
    ok: false,
    error: {
      code: 'PROVIDER_FAILURE',
      message:
        'The operation failed. No substitute data was returned. Inspect private diagnostics.',
      retryable: false,
    },
  };
}
export function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new StudyError(
      'CANCELLED',
      'The request was cancelled. Any Agent reservation remains counted.',
    );
}
