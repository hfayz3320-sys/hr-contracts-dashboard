/**
 * Same-origin Cloudflare Pages Function proxy: /api/* → production Worker.
 *
 * Why this file exists
 * --------------------
 * The frontend lives at `https://mid-contracts-dashboard.pages.dev` and the
 * Worker lives at `https://hr-contracts-api-v2-production.hfayz3320.workers.dev`.
 * Cloudflare Access sets its JWT cookie (`CF_Authorization`) host-scoped to
 * the Pages hostname only; a direct cross-origin browser fetch from the
 * Pages app to the Worker would NOT carry that cookie or the
 * `Cf-Access-Jwt-Assertion` header (Access only injects that header on
 * requests routed *through* a protected origin).
 *
 * By proxying same-origin (`/api/*` on the Pages domain), every API call
 * goes through Cloudflare Access first — so the JWT is automatically
 * attached on the way in, and we forward it verbatim to the Worker. The
 * Worker validates it against the same JWKS / AUD / TEAM, so its existing
 * `requireAuth` / `requireAdmin` middleware works unchanged.
 *
 * What this proxy does NOT do
 * ---------------------------
 *   - Loosen auth: it forwards the JWT untouched; the Worker still rejects
 *     unauthenticated calls with 401 and X-Dev-Admin-Email with 400.
 *   - Inject any new credentials of its own (no service token, no shared
 *     secret, no header rewrite that could grant elevated access).
 *   - Trust X-Dev-Admin-Email: it is explicitly stripped on the way in.
 *   - Cache responses: streaming pass-through preserves status, headers,
 *     and body byte-for-byte.
 */

const WORKER_BASE = 'https://hr-contracts-api-v2-production.hfayz3320.workers.dev';

interface PagesContext {
  request: Request;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request } = context;
  const url = new URL(request.url);

  // Reconstruct the upstream URL on the Worker. Path + query are passed
  // through unchanged — the Pages Function routing only fires for /api/*,
  // so url.pathname always begins with /api/.
  const upstreamUrl = WORKER_BASE + url.pathname + url.search;

  // `new Request(newUrl, oldRequest)` clones the inbound request to a new
  // URL while preserving method, headers, and (streamed) body. This is the
  // canonical Workers/Pages proxy pattern.
  const proxyRequest = new Request(upstreamUrl, request);

  // Strip headers that should not cross the proxy boundary:
  //   - host: would point at *.pages.dev; the Worker should derive its own.
  //   - x-dev-admin-email: never trust this header in any environment.
  //     The Worker hard-rejects it in production but defense-in-depth here
  //     prevents accidental leakage even if the upstream env ever drifts.
  proxyRequest.headers.delete('host');
  proxyRequest.headers.delete('x-dev-admin-email');

  // CF Access automatically adds these on the way in to the Pages app
  // when the user is authenticated; they are forwarded as-is, NOT
  // re-signed or modified:
  //   - Cf-Access-Jwt-Assertion           (the JWT — required by Worker)
  //   - Cf-Access-Authenticated-User-Email (the verified email — used to
  //                                         match against ADMIN_EMAILS)

  try {
    return await fetch(proxyRequest);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'PROXY_ERROR',
        message: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
