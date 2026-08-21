import type { ProblemDetails } from "./contracts";

export class BeeexyApiError extends Error {
  readonly status: number;
  readonly problem?: ProblemDetails;
  readonly retryAfter?: string;
  readonly correlationId?: string;

  constructor(status: number, options: { problem?: ProblemDetails; retryAfter?: string; correlationId?: string } = {}) {
    super(safeMessageForStatus(status));
    this.name = "BeeexyApiError";
    this.status = status;
    this.problem = options.problem;
    this.retryAfter = options.retryAfter;
    this.correlationId = options.problem?.correlationId || options.correlationId;
  }
}

export class BeeexyNetworkError extends Error {
  constructor() {
    super("Beeexy could not reach the server.");
    this.name = "BeeexyNetworkError";
  }
}

function safeMessageForStatus(status: number) {
  if (status === 401) return "The authentication request was not accepted.";
  if (status === 404) return "The requested resource is unavailable.";
  if (status === 409) return "The request conflicts with the current server state.";
  if (status === 422) return "The submitted information is not valid.";
  if (status === 429) return "Too many requests were made.";
  if (status === 503) return "The requested service is temporarily unavailable.";
  return "Beeexy could not complete the request.";
}

export async function createApiError(response: Response) {
  let problem: ProblemDetails | undefined;
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("json")) {
    try {
      problem = await response.json() as ProblemDetails;
    } catch {
      problem = undefined;
    }
  }

  return new BeeexyApiError(response.status, {
    problem,
    retryAfter: response.headers.get("retry-after") || undefined,
    correlationId: response.headers.get("x-correlation-id") || undefined,
  });
}
