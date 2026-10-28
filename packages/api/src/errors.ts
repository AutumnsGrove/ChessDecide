/**
 * Error type the API layer maps to its JSON envelope (docs/API.md §1).
 * Throw this from routes, control planes and adapters instead of building responses by hand.
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public detail: unknown = {},
    public retryable = code === 'upstream_error' || code === 'rate_limited',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
