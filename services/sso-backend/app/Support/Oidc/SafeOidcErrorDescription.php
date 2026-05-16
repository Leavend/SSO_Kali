<?php

declare(strict_types=1);

namespace App\Support\Oidc;

/**
 * BE-FR062-001 — Safe `error_description` catalog.
 *
 * RFC 6749 §4.1.2.1 + OIDC Core §3.1.2.6 allow `error_description` strings
 * to be returned to relying parties. We must never propagate raw exception
 * text (SQLSTATE, vendor paths, internal class names) into that channel.
 *
 * This catalog returns a small set of vetted, locale-neutral safe phrases
 * keyed by OAuth/OIDC error codes. Callers either map a known code from a
 * domain exception or fall back to the generic message. The original
 * technical reason MUST be logged separately, never echoed to the wire.
 */
final class SafeOidcErrorDescription
{
    public const FALLBACK = 'The request could not be completed.';

    /**
     * @var array<string, string>
     */
    private const MESSAGES = [
        'invalid_request' => 'The request is malformed or missing required parameters.',
        'invalid_client' => 'Client authentication failed.',
        'invalid_grant' => 'The provided grant or refresh token is invalid, expired, revoked, or does not match the client.',
        'unauthorized_client' => 'The client is not authorized to use this grant.',
        'unsupported_grant_type' => 'The requested grant type is not supported.',
        'unsupported_response_type' => 'The requested response type is not supported.',
        'invalid_scope' => 'The requested scope is invalid, unknown, or exceeds what is permitted for this client.',
        'access_denied' => 'The request was denied.',
        'consent_required' => 'User consent is required to complete this request.',
        'login_required' => 'User authentication is required to complete this request.',
        'interaction_required' => 'User interaction is required to complete this request.',
        'invalid_token' => 'The bearer token is invalid, expired, or revoked.',
        'temporarily_unavailable' => 'The service is temporarily unavailable. Please try again.',
        'server_error' => 'An unexpected error occurred. Please retry.',
        'invalid_redirect_uri' => 'The redirect URI is not registered for this client.',
        'invalid_pkce' => 'The PKCE verifier does not match the original challenge.',
        'invalid_authorization_code' => 'The authorization code is invalid, expired, or already used.',
        'pkce_verification_failed' => 'PKCE verification failed.',
        'invalid_client_authentication' => 'Client authentication failed.',
        'invalid_refresh_token' => 'The refresh token is invalid, expired, or revoked.',
        'refresh_scope_emptied' => 'No requested scope is currently allowed for this client.',
        'session_expired' => 'The user session has expired and cannot be reused.',
        'mfa_required' => 'Multi-factor authentication is required to continue.',
    ];

    public static function for(string $code, ?string $fallback = null): string
    {
        return self::MESSAGES[$code] ?? ($fallback !== null && trim($fallback) !== ''
            ? trim($fallback)
            : self::FALLBACK);
    }

    public static function safe(string $code): string
    {
        return self::MESSAGES[$code] ?? self::FALLBACK;
    }
}
