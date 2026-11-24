// Safe, informative logging for failures of outbound requests.
//
// Error messages are never logged: they can contain URLs (a `TypeError: Invalid URL`
// carries the full input in `error.input`, some libraries put the request URL in the
// message) and calendar links or tokens are secrets. Instead every error is reduced to a
// fixed classification built only from vetted fields:
//
//   kind=http status=503          the source answered with a non-2xx status
//   kind=timeout                  AbortSignal.timeout fired (connect or body)
//   kind=network code=ENOTFOUND   fetch failed before a response (DNS, TCP, TLS, reset)
//   kind=size                     response exceeded our size limit
//   kind=invalid-response         redirect, content type, empty body or malformed JSON
//   kind=parse                    the body could not be parsed into data
//   kind=config reason=invalid-json  our own configuration is invalid (reason is a fixed code)
//   kind=unknown name=RangeError  anything else; only the error class name

export const ERROR_KINDS = ["http", "timeout", "network", "size", "invalid-response", "parse", "config", "unknown"];

const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,47}$/;
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9]{0,47}$/;
const SAFE_REASON = /^[a-z][a-z-]{0,23}(?::\d{1,2})?$/;

// Creates an error for a failed upstream request. `status` is the upstream HTTP status;
// it is stored separately from `error.status`, which the API layer uses for its own response.
export function upstreamError(message, { kind, status } = {}) {
  const error = new Error(message);
  if (kind) error.kind = kind;
  if (Number.isInteger(status)) {
    error.upstreamStatus = status;
    error.kind ??= "http";
  }
  return error;
}

function networkCode(error) {
  // undici puts the system error in `cause`; with several addresses it can be an
  // AggregateError whose own `errors` hold the codes.
  const candidates = [error?.cause, error?.cause?.cause, ...(Array.isArray(error?.cause?.errors) ? error.cause.errors : [])];
  for (const candidate of candidates) {
    if (typeof candidate?.code === "string" && SAFE_CODE.test(candidate.code)) return candidate.code;
  }
  return null;
}

function isTimeout(error) {
  if (error?.name === "TimeoutError") return true;
  // An aborted body read can surface as an AbortError whose cause is the TimeoutError.
  return error?.name === "AbortError" && error?.cause?.name === "TimeoutError";
}

export function classifyFetchError(error) {
  if (error && ERROR_KINDS.includes(error.kind)) {
    const status = Number.isInteger(error.upstreamStatus) ? error.upstreamStatus : null;
    if (error.kind === "network") return { kind: "network", code: networkCode(error) };
    if (error.kind === "config") return { kind: "config", reason: typeof error.reason === "string" && SAFE_REASON.test(error.reason) ? error.reason : null };
    return status !== null ? { kind: error.kind, status } : { kind: error.kind };
  }
  if (Number.isInteger(error?.upstreamStatus)) return { kind: "http", status: error.upstreamStatus };
  if (isTimeout(error)) return { kind: "timeout" };
  if (error?.name === "TypeError" && error?.message === "fetch failed") return { kind: "network", code: networkCode(error) };
  if (error?.name === "SyntaxError") return { kind: "parse" };
  const code = networkCode(error);
  if (code) return { kind: "network", code };
  const name = typeof error?.name === "string" && SAFE_NAME.test(error.name) ? error.name : "Error";
  return { kind: "unknown", name };
}

export function formatFetchError(error) {
  const details = classifyFetchError(error);
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
}

// Labels must be fixed identifiers (source ids, route paths), never URLs or user data.
// Allowed: source ids ("de-tijd"), cache keys ("standings:nba", "cal-1") and API paths
// ("/api/sport/nba/overview"). Anything URL-like (scheme, "//", "@", "?", "=") is rejected;
// the "prefix:value" form is limited to the sports cache prefixes so "https:..." never passes.
const SAFE_LABEL = /^(?:\/api(?:\/[a-z0-9-]{1,40}){1,4}|(?:standings|fixtures|news|players):[a-z0-9-]{1,40}|[a-z0-9][a-z0-9-]{0,40})$/i;

export function isSafeLabel(label) {
  return typeof label === "string" && SAFE_LABEL.test(label);
}

export function logFetchFailure(scope, label, error, log = console.error) {
  const safeLabel = isSafeLabel(label) ? label : "unlabelled";
  log(`${scope} failed: ${safeLabel} ${formatFetchError(error)}`);
}
