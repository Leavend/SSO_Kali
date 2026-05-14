/**
 * Warm-up OIDC metadata caches at idle time (FR-003 / UC-77).
 *
 * The first OIDC flow (login, silent auth, token exchange) would otherwise
 * pay a ~500ms-1.5s cold-handshake + round-trip latency for Discovery +
 * JWKS. By fetching both during browser idle time shortly after boot, the
 * caches are hot before the user even clicks "Sign in".
 *
 * Rules:
 *   - Fire-and-forget. Never throws or blocks.
 *   - Uses requestIdleCallback when available so we don't compete with
 *     critical page-load work. Falls back to setTimeout(0).
 *   - Reads issuer from OIDC config; computes the standard well-known URLs.
 */

import { fetchDiscovery } from "./discovery";
import { fetchJwks } from "./jwks";
import { readOidcConfig } from "./config";
import {
	assertCanonicalMetadata,
	CanonicalizationError,
} from "./canonicalization";

type IdleCallback = (cb: () => void) => number;

export function warmOidcMetadata(): void {
	if (typeof window === "undefined") return;

	const idle: IdleCallback =
		typeof window.requestIdleCallback === "function"
			? (cb) => window.requestIdleCallback(cb, { timeout: 3_000 })
			: (cb) => window.setTimeout(cb, 0);

	idle(() => {
		void prefetchQuietly();
	});
}

function reportCanonicalizationViolation(error: CanonicalizationError): void {
	console.error(
		`[OIDC] Discovery canonicalization violation (${error.code}): ${error.message}`,
	);
}

async function prefetchQuietly(): Promise<void> {
	try {
		const config = readOidcConfig();
		const issuer = config.issuer.replace(/\/$/, "");
		const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
		const jwksUrl = `${issuer}/.well-known/jwks.json`;

		// Independent — one failure must not block the other (FR-061 pattern).
		const [discovery] = await Promise.allSettled([
			fetchDiscovery(discoveryUrl),
			fetchJwks(jwksUrl),
		]);

		// FR-005: advisory canonicalization check. Don't throw — warming must
		// stay non-blocking — but surface drift in the console so ops catches
		// a misconfigured deploy before users encounter token validation errors.
		if (discovery.status === "fulfilled") {
			try {
				assertCanonicalMetadata(discovery.value, config.issuer);
			} catch (err) {
				if (err instanceof CanonicalizationError) {
					reportCanonicalizationViolation(err);
				}
			}
		}
	} catch {
		// Silent fail — this is an optimization, not a critical path.
	}
}
