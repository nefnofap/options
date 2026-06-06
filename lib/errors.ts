// Structured error model so API routes can surface the *real* upstream
// cause (which provider failed, with what status and message) instead of a
// generic "not found".

export class UpstreamError extends Error {
  source: string;
  status: number;
  constructor(source: string, status: number, message: string) {
    super(message);
    this.name = "UpstreamError";
    this.source = source;
    this.status = status;
  }
}

export interface ErrorPayload {
  error: string;
  source?: string;
  status?: number;
}

export function describeError(e: unknown): ErrorPayload {
  if (e instanceof UpstreamError) {
    return { error: e.message, source: e.source, status: e.status };
  }
  if (e instanceof Error) return { error: e.message };
  return { error: String(e) };
}

// HTTP status to return to the client. A genuine 404 (symbol not listed)
// stays a 404; everything else is a 502 Bad Gateway (upstream problem).
export function httpStatusFor(e: unknown): number {
  if (e instanceof UpstreamError && e.status === 404) return 404;
  return 502;
}
