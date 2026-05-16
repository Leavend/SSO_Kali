<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Actions\Audit\RecordLogoutAuditEventAction;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\BackChannelSessionRegistry;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Oidc\DownstreamClient;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use RuntimeException;

/**
 * BE-FR043-001 — OIDC Front-Channel Logout 1.0 §3 fallback renderer.
 *
 * Returns a minimal HTML page containing one iframe per RP registered
 * for the active subject. Each iframe targets the RP's
 * `frontchannel_logout_uri`, with the OIDC issuer + session id appended
 * when the RP registration sets `frontchannel_logout_session_required`
 * (default true). The browser executes the iframe loads as the user is
 * being signed out, so RPs without back-channel support still receive
 * a logout signal during global SSO logout.
 *
 * Security:
 * - Authorisation is bearer-token bound (subject claim must match the
 *   sid claim) — we never expose another user's iframe URLs.
 * - All `iss`, `sid`, and `frontchannel_logout_uri` values are HTML-escaped
 *   via `e()` to remove any chance of attribute injection.
 * - `Content-Security-Policy` blocks scripts and only allows iframes from
 *   `https:`/`http:` (not `data:` or `javascript:`); `X-Frame-Options:DENY`
 *   keeps the fallback page itself out of attacker iframes.
 */
final class RenderFrontChannelLogoutFallback
{
    public function __construct(
        private readonly AccessTokenGuard $tokens,
        private readonly BackChannelSessionRegistry $registry,
        private readonly DownstreamClientRegistry $clients,
        private readonly RecordLogoutAuditEventAction $audit,
    ) {}

    public function handle(Request $request): Response
    {
        $claims = $this->claims($request);
        $subjectId = $this->stringClaim($claims, 'sub');
        $sessionId = $this->stringClaim($claims, 'sid');

        if ($subjectId === null || $sessionId === null) {
            return $this->emptyResponse(401);
        }

        $iframes = $this->buildIframes($subjectId, $sessionId);
        $this->auditRendered($subjectId, $sessionId, $iframes);

        return $this->htmlResponse($iframes);
    }

    /**
     * @return list<string>
     */
    private function buildIframes(string $subjectId, string $sessionId): array
    {
        $issuer = (string) config('sso.issuer', '');
        $iframes = [];

        foreach ($this->registry->sessionIdsForSubject($subjectId) as $sid) {
            foreach ($this->registry->forSession($sid) as $registration) {
                $url = $this->iframeUrl($registration, $issuer, $sid);
                if ($url !== null) {
                    $iframes[] = $url;
                }
            }
        }

        // Always include the originating sid in case it has not yet hit the
        // for-subject lookup (e.g. cache miss between fan-out and render).
        if (! in_array($sessionId, $this->registry->sessionIdsForSubject($subjectId), true)) {
            foreach ($this->registry->forSession($sessionId) as $registration) {
                $url = $this->iframeUrl($registration, $issuer, $sessionId);
                if ($url !== null) {
                    $iframes[] = $url;
                }
            }
        }

        return array_values(array_unique($iframes));
    }

    /**
     * @param  array<string, mixed>  $registration
     */
    private function iframeUrl(array $registration, string $issuer, string $sessionId): ?string
    {
        $clientId = $this->stringValue($registration, 'client_id');
        $frontchannelUri = $this->stringValue($registration, 'frontchannel_logout_uri');

        if ($clientId === null || $frontchannelUri === null) {
            return null;
        }

        $client = $this->clients->find($clientId);
        if (! $client instanceof DownstreamClient || ! $client->hasValidFrontchannelLogoutUri()) {
            return null;
        }

        if (! $client->frontchannelLogoutSessionRequired) {
            return $frontchannelUri;
        }

        $separator = str_contains($frontchannelUri, '?') ? '&' : '?';

        return $frontchannelUri.$separator.http_build_query([
            'iss' => $issuer,
            'sid' => $sessionId,
        ], '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * @param  list<string>  $iframes
     */
    private function htmlResponse(array $iframes): Response
    {
        $body = $this->buildHtml($iframes);

        return response($body, 200)
            ->header('Content-Type', 'text/html; charset=utf-8')
            ->header('Cache-Control', 'no-store')
            ->header('Pragma', 'no-cache')
            ->header('X-Frame-Options', 'DENY')
            ->header('Referrer-Policy', 'no-referrer')
            ->header('Content-Security-Policy', "default-src 'none'; frame-src https: http:; style-src 'self' 'unsafe-inline'; img-src 'none'; base-uri 'none'");
    }

    /**
     * @param  list<string>  $iframes
     */
    private function buildHtml(array $iframes): string
    {
        $rendered = '';
        foreach ($iframes as $iframe) {
            $rendered .= sprintf(
                "  <iframe src=\"%s\" sandbox=\"allow-same-origin allow-scripts\" referrerpolicy=\"no-referrer\" loading=\"eager\"></iframe>\n",
                e($iframe),
            );
        }

        return <<<HTML
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Signing out</title>
  <meta name="robots" content="noindex,nofollow,noarchive">
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 1rem; color: #444; }
    iframe { display: none; width: 0; height: 0; border: 0; }
    p { margin: 0; }
  </style>
</head>
<body>
  <p>Signing you out of all applications…</p>
{$rendered}</body>
</html>
HTML;
    }

    private function emptyResponse(int $status): Response
    {
        return response('', $status)
            ->header('Content-Type', 'text/html; charset=utf-8')
            ->header('Cache-Control', 'no-store')
            ->header('X-Frame-Options', 'DENY');
    }

    /**
     * @param  list<string>  $iframes
     */
    private function auditRendered(string $subjectId, string $sessionId, array $iframes): void
    {
        $this->audit->execute('frontchannel_logout_rendered', [
            'logout_channel' => 'frontchannel',
            'result' => 'rendered',
            'session_id' => $sessionId,
            'subject_id' => $subjectId,
            'iframe_count' => count($iframes),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function claims(Request $request): array
    {
        try {
            return $this->tokens->claimsFrom((string) $request->bearerToken());
        } catch (RuntimeException) {
            return [];
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function stringClaim(array $claims, string $name): ?string
    {
        return is_string($claims[$name] ?? null) && $claims[$name] !== '' ? $claims[$name] : null;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function stringValue(array $payload, string $key): ?string
    {
        $value = $payload[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }
}
