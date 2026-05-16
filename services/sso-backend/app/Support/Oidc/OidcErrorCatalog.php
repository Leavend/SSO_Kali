<?php

declare(strict_types=1);

namespace App\Support\Oidc;

use App\Enums\SsoErrorCode;

/**
 * BE-FR060-001 — central OAuth/OIDC error taxonomy.
 *
 * Combines RFC 6749 §4.1.2.1 / §5.2 / §7.2 errors, OIDC Core §3.1.2.6 errors,
 * RFC 7009 / RFC 7662 errors, and SSO-specific codes into a single registry
 * so every responder can resolve protocol HTTP status, safe `error_description`,
 * UI copy key, retryability, and recommended support action without
 * duplicating literals across the codebase.
 *
 * Callers should never invent new error codes inline. Either reuse a code
 * from the registry or extend it here so the snapshot test in
 * `tests/Feature/Oidc/OidcErrorCatalogContractTest.php` ratifies the
 * addition.
 */
final class OidcErrorCatalog
{
    /**
     * Recommended support action labels.
     */
    public const ACTION_RETRY = 'retry';

    public const ACTION_LOGIN = 'login';

    public const ACTION_CONTACT_SUPPORT = 'contact_support';

    public const ACTION_NONE = 'none';

    /**
     * @var array<string, array{status: int, description_key: string, copy_key: string, retryable: bool, action: string, source: string}>
     */
    private const CODES = [
        // RFC 6749 §4.1.2.1 — authorization endpoint.
        'invalid_request' => self::AUTH_INVALID_REQUEST,
        'unauthorized_client' => [
            'status' => 400,
            'description_key' => 'unauthorized_client',
            'copy_key' => 'oauth.errors.unauthorized_client',
            'retryable' => false,
            'action' => self::ACTION_CONTACT_SUPPORT,
            'source' => 'rfc6749',
        ],
        'access_denied' => [
            'status' => 403,
            'description_key' => 'access_denied',
            'copy_key' => 'oauth.errors.access_denied',
            'retryable' => false,
            'action' => self::ACTION_LOGIN,
            'source' => 'rfc6749',
        ],
        'unsupported_response_type' => [
            'status' => 400,
            'description_key' => 'unsupported_response_type',
            'copy_key' => 'oauth.errors.unsupported_response_type',
            'retryable' => false,
            'action' => self::ACTION_CONTACT_SUPPORT,
            'source' => 'rfc6749',
        ],
        'invalid_scope' => [
            'status' => 400,
            'description_key' => 'invalid_scope',
            'copy_key' => 'oauth.errors.invalid_scope',
            'retryable' => false,
            'action' => self::ACTION_CONTACT_SUPPORT,
            'source' => 'rfc6749',
        ],
        'server_error' => [
            'status' => 500,
            'description_key' => 'server_error',
            'copy_key' => 'oauth.errors.server_error',
            'retryable' => true,
            'action' => self::ACTION_RETRY,
            'source' => 'rfc6749',
        ],
        'temporarily_unavailable' => [
            'status' => 503,
            'description_key' => 'temporarily_unavailable',
            'copy_key' => 'oauth.errors.temporarily_unavailable',
            'retryable' => true,
            'action' => self::ACTION_RETRY,
            'source' => 'rfc6749',
        ],

        // RFC 6749 §5.2 — token endpoint.
        'invalid_client' => [
            'status' => 401,
            'description_key' => 'invalid_client',
            'copy_key' => 'oauth.errors.invalid_client',
            'retryable' => false,
            'action' => self::ACTION_CONTACT_SUPPORT,
            'source' => 'rfc6749',
        ],
        'invalid_grant' => [
            'status' => 400,
            'description_key' => 'invalid_grant',
            'copy_key' => 'oauth.errors.invalid_grant',
            'retryable' => false,
            'action' => self::ACTION_LOGIN,
            'source' => 'rfc6749',
        ],
        'unsupported_grant_type' => [
            'status' => 400,
            'description_key' => 'unsupported_grant_type',
            'copy_key' => 'oauth.errors.unsupported_grant_type',
            'retryable' => false,
            'action' => self::ACTION_CONTACT_SUPPORT,
            'source' => 'rfc6749',
        ],

        // RFC 6750 §3.1 — bearer token errors.
        'invalid_token' => [
            'status' => 401,
            'description_key' => 'invalid_token',
            'copy_key' => 'oauth.errors.invalid_token',
            'retryable' => false,
            'action' => self::ACTION_LOGIN,
            'source' => 'rfc6750',
        ],
        'insufficient_scope' => [
            'status' => 403,
            'description_key' => 'insufficient_scope',
            'copy_key' => 'oauth.errors.insufficient_scope',
            'retryable' => false,
            'action' => self::ACTION_CONTACT_SUPPORT,
            'source' => 'rfc6750',
        ],

        // OIDC Core §3.1.2.6 / §3.1.2.5 — interactive errors.
        'login_required' => [
            'status' => 401,
            'description_key' => 'login_required',
            'copy_key' => 'oauth.errors.login_required',
            'retryable' => true,
            'action' => self::ACTION_LOGIN,
            'source' => 'oidc-core',
        ],
        'interaction_required' => [
            'status' => 400,
            'description_key' => 'interaction_required',
            'copy_key' => 'oauth.errors.interaction_required',
            'retryable' => true,
            'action' => self::ACTION_LOGIN,
            'source' => 'oidc-core',
        ],
        'consent_required' => [
            'status' => 400,
            'description_key' => 'consent_required',
            'copy_key' => 'oauth.errors.consent_required',
            'retryable' => true,
            'action' => self::ACTION_LOGIN,
            'source' => 'oidc-core',
        ],
        'account_selection_required' => [
            'status' => 400,
            'description_key' => 'access_denied',
            'copy_key' => 'oauth.errors.account_selection_required',
            'retryable' => true,
            'action' => self::ACTION_LOGIN,
            'source' => 'oidc-core',
        ],
        'invalid_request_uri' => [
            'status' => 400,
            'description_key' => 'invalid_request',
            'copy_key' => 'oauth.errors.invalid_request_uri',
            'retryable' => false,
            'action' => self::ACTION_CONTACT_SUPPORT,
            'source' => 'oidc-core',
        ],
        'invalid_request_object' => [
            'status' => 400,
            'description_key' => 'invalid_request',
            'copy_key' => 'oauth.errors.invalid_request_object',
            'retryable' => false,
            'action' => self::ACTION_CONTACT_SUPPORT,
            'source' => 'oidc-core',
        ],
        'request_not_supported' => [
            'status' => 400,
            'description_key' => 'invalid_request',
            'copy_key' => 'oauth.errors.request_not_supported',
            'retryable' => false,
            'action' => self::ACTION_CONTACT_SUPPORT,
            'source' => 'oidc-core',
        ],
        'request_uri_not_supported' => [
            'status' => 400,
            'description_key' => 'invalid_request',
            'copy_key' => 'oauth.errors.request_uri_not_supported',
            'retryable' => false,
            'action' => self::ACTION_CONTACT_SUPPORT,
            'source' => 'oidc-core',
        ],
        'registration_not_supported' => [
            'status' => 400,
            'description_key' => 'invalid_request',
            'copy_key' => 'oauth.errors.registration_not_supported',
            'retryable' => false,
            'action' => self::ACTION_CONTACT_SUPPORT,
            'source' => 'oidc-core',
        ],

        // SSO-specific codes used by the application but never wire-emitted
        // outside our catalog. Map them to safe descriptions and UI copy keys.
        'invalid_redirect_uri' => [
            'status' => 400,
            'description_key' => 'invalid_redirect_uri',
            'copy_key' => 'oauth.errors.invalid_request',
            'retryable' => false,
            'action' => self::ACTION_CONTACT_SUPPORT,
            'source' => 'sso',
        ],
        'invalid_pkce' => [
            'status' => 400,
            'description_key' => 'invalid_pkce',
            'copy_key' => 'oauth.errors.invalid_request',
            'retryable' => false,
            'action' => self::ACTION_LOGIN,
            'source' => 'sso',
        ],
        'pkce_verification_failed' => [
            'status' => 400,
            'description_key' => 'pkce_verification_failed',
            'copy_key' => 'oauth.errors.invalid_request',
            'retryable' => false,
            'action' => self::ACTION_LOGIN,
            'source' => 'sso',
        ],
        'invalid_authorization_code' => [
            'status' => 400,
            'description_key' => 'invalid_authorization_code',
            'copy_key' => 'oauth.errors.invalid_request',
            'retryable' => false,
            'action' => self::ACTION_LOGIN,
            'source' => 'sso',
        ],
        'invalid_client_authentication' => [
            'status' => 401,
            'description_key' => 'invalid_client_authentication',
            'copy_key' => 'oauth.errors.invalid_client',
            'retryable' => false,
            'action' => self::ACTION_CONTACT_SUPPORT,
            'source' => 'sso',
        ],
        'invalid_refresh_token' => [
            'status' => 400,
            'description_key' => 'invalid_refresh_token',
            'copy_key' => 'oauth.errors.invalid_grant',
            'retryable' => false,
            'action' => self::ACTION_LOGIN,
            'source' => 'sso',
        ],
        'refresh_scope_emptied' => [
            'status' => 400,
            'description_key' => 'refresh_scope_emptied',
            'copy_key' => 'oauth.errors.invalid_scope',
            'retryable' => false,
            'action' => self::ACTION_LOGIN,
            'source' => 'sso',
        ],
        'session_expired' => [
            'status' => 401,
            'description_key' => 'session_expired',
            'copy_key' => 'oauth.errors.session_expired',
            'retryable' => true,
            'action' => self::ACTION_LOGIN,
            'source' => 'sso',
        ],
        'session_not_found' => [
            'status' => 404,
            'description_key' => 'invalid_request',
            'copy_key' => 'oauth.errors.session_expired',
            'retryable' => false,
            'action' => self::ACTION_LOGIN,
            'source' => 'sso',
        ],
        'mfa_required' => [
            'status' => 400,
            'description_key' => 'mfa_required',
            'copy_key' => 'oauth.errors.mfa_enrollment_required',
            'retryable' => true,
            'action' => self::ACTION_LOGIN,
            'source' => 'sso',
        ],
        'mfa_reenrollment_required' => [
            'status' => 403,
            'description_key' => 'mfa_required',
            'copy_key' => 'oauth.errors.mfa_reenrollment_required',
            'retryable' => false,
            'action' => self::ACTION_LOGIN,
            'source' => 'sso',
        ],
        'too_many_attempts' => [
            'status' => 429,
            'description_key' => 'invalid_request',
            'copy_key' => 'oauth.errors.too_many_attempts',
            'retryable' => true,
            'action' => self::ACTION_RETRY,
            'source' => 'sso',
        ],
        'invalid_payload' => [
            'status' => 422,
            'description_key' => 'invalid_request',
            'copy_key' => 'oauth.errors.invalid_request',
            'retryable' => false,
            'action' => self::ACTION_NONE,
            'source' => 'sso',
        ],
        'not_found' => [
            'status' => 404,
            'description_key' => 'invalid_request',
            'copy_key' => 'oauth.errors._generic',
            'retryable' => false,
            'action' => self::ACTION_NONE,
            'source' => 'sso',
        ],
        'forbidden' => [
            'status' => 403,
            'description_key' => 'access_denied',
            'copy_key' => 'oauth.errors.access_denied',
            'retryable' => false,
            'action' => self::ACTION_CONTACT_SUPPORT,
            'source' => 'sso',
        ],
    ];

    /**
     * Constant for the auth invalid_request entry to satisfy PHPStan ordering.
     *
     * @var array{status: int, description_key: string, copy_key: string, retryable: bool, action: string, source: string}
     */
    private const AUTH_INVALID_REQUEST = [
        'status' => 400,
        'description_key' => 'invalid_request',
        'copy_key' => 'oauth.errors.invalid_request',
        'retryable' => false,
        'action' => self::ACTION_CONTACT_SUPPORT,
        'source' => 'rfc6749',
    ];

    public static function has(string $code): bool
    {
        return array_key_exists($code, self::CODES);
    }

    /**
     * @return array{status: int, description_key: string, copy_key: string, retryable: bool, action: string, source: string}
     */
    public static function describe(string $code): array
    {
        return self::CODES[$code] ?? self::CODES['server_error'];
    }

    public static function status(string $code): int
    {
        return self::describe($code)['status'];
    }

    public static function safeDescription(string $code): string
    {
        return SafeOidcErrorDescription::for(self::describe($code)['description_key']);
    }

    public static function copyKey(string $code): string
    {
        return self::describe($code)['copy_key'];
    }

    public static function isRetryable(string $code): bool
    {
        return self::describe($code)['retryable'];
    }

    public static function recommendedAction(string $code): string
    {
        return self::describe($code)['action'];
    }

    /**
     * @return list<string>
     */
    public static function allCodes(): array
    {
        return array_keys(self::CODES);
    }

    public static function fromEnum(SsoErrorCode $code): string
    {
        return $code->value;
    }
}
