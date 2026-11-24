import { createHash, timingSafeEqual } from "node:crypto";

// Verifies Auth.js's double-submit CSRF token: the httpOnly cookie holds
// "<token>|sha256(<token><secret>)" and the request body must carry the same <token>.
// The page gets the token from /api/auth/csrf, which also sets the cookie.

export function readCookie(cookieHeader, name) {
  for (const part of String(cookieHeader ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

function safeEqual(first, second) {
  const a = Buffer.from(String(first));
  const b = Buffer.from(String(second));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyCsrfToken({ cookieHeader, cookieName, secret, bodyToken }) {
  if (typeof bodyToken !== "string" || bodyToken.length < 16 || bodyToken.length > 256) return false;
  const cookie = readCookie(cookieHeader, cookieName);
  if (!cookie) return false;
  const [token, hash] = cookie.split("|");
  if (!token || !hash) return false;
  const expected = createHash("sha256").update(`${token}${secret}`).digest("hex");
  return safeEqual(hash, expected) && safeEqual(token, bodyToken);
}

// Accepts only same-origin requests: Origin must equal the configured app origin.
export function isAllowedOrigin(originHeader, appUrl) {
  if (typeof originHeader !== "string" || !originHeader) return false;
  try {
    return new URL(originHeader).origin === new URL(appUrl).origin && originHeader === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
