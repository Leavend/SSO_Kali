<?php

declare(strict_types=1);

namespace App\Support\Responses;

use App\Support\Oidc\OidcErrorCatalog;
use App\Support\Oidc\SafeOidcErrorDescription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * BE-FR062-001 / BE-FR063-001 — uniform OAuth/OIDC error responder.
 *
 * Every error returned by an OIDC/OAuth/admin endpoint flows through this
 * helper so:
 *   - `error_description` is always a safe phrase from the {@see SafeOidcErrorDescription}
 *     catalog (no SQLSTATE, vendor paths, exception text).
 *   - `error` codes always come from {@see OidcErrorCatalog} (no arbitrary
 *     strings emitted).
 *   - The current `X-Request-Id` is mirrored back into the response body and
 *     headers so the FE can render a copyable support reference.
 *   - When the caller does not supply `error_ref`, the responder mints a
 *     redacted `SSOERR-*` reference so support can correlate logs without
 *     the user ever seeing technical detail.
 *   - The original technical reason is logged once with the `error_ref` so
 *     operators can join logs without leaking it on the wire.
 */
final class OidcErrorResponse
{
    public static function json(
        string $error,
        ?string $description = null,
        ?int $status = null,
        ?string $errorRef = null,
        ?string $requestId = null,
        ?Throwable $exception = null,
    ): JsonResponse {
        $resolvedError = OidcErrorCatalog::has($error) ? $error : 'server_error';
        $resolvedStatus = $status ?? OidcErrorCatalog::status($resolvedError);
        $safeDescription = self::safeDescription($resolvedError, $description);
        $resolvedRequestId = $requestId ?? self::currentRequestId();
        $resolvedErrorRef = $errorRef ?? self::mintRef($resolvedError, $description, $exception);

        $payload = [
            'error' => $resolvedError,
            'error_description' => $safeDescription,
        ];

        if ($resolvedErrorRef !== '') {
            $payload['error_ref'] = $resolvedErrorRef;
        }

        if ($resolvedRequestId !== null && $resolvedRequestId !== '') {
            $payload['request_id'] = $resolvedRequestId;
        }

        $payload['retryable'] = OidcErrorCatalog::isRetryable($resolvedError);
        $payload['support_action'] = OidcErrorCatalog::recommendedAction($resolvedError);

        $headers = [
            'Cache-Control' => 'no-store',
            'Pragma' => 'no-cache',
        ];

        if ($resolvedErrorRef !== '') {
            $headers['X-Error-Ref'] = $resolvedErrorRef;
        }

        if ($resolvedRequestId !== null && $resolvedRequestId !== '') {
            $headers['X-Request-Id'] = $resolvedRequestId;
        }

        return response()->json($payload, $resolvedStatus)->withHeaders($headers);
    }

    public static function redirect(
        string $redirectUri,
        string $error,
        ?string $description = null,
        ?string $state = null,
        ?Throwable $exception = null,
    ): RedirectResponse {
        $resolvedError = OidcErrorCatalog::has($error) ? $error : 'server_error';
        $safeDescription = self::safeDescription($resolvedError, $description);
        $errorRef = self::mintRef($resolvedError, $description, $exception);
        $requestId = self::currentRequestId();

        $query = array_filter([
            'error' => $resolvedError,
            'error_description' => $safeDescription,
            'state' => $state,
            'error_ref' => $errorRef,
            'request_id' => $requestId,
        ], static fn (?string $value): bool => $value !== null && $value !== '');

        $separator = str_contains($redirectUri, '?') ? '&' : '?';

        return redirect()->away($redirectUri.$separator.http_build_query($query));
    }

    private static function safeDescription(string $error, ?string $candidate): string
    {
        if ($candidate === null) {
            return OidcErrorCatalog::safeDescription($error);
        }

        $trimmed = trim($candidate);

        if ($trimmed === '') {
            return OidcErrorCatalog::safeDescription($error);
        }

        if (self::looksTechnical($trimmed)) {
            return OidcErrorCatalog::safeDescription($error);
        }

        return SafeOidcErrorDescription::for(OidcErrorCatalog::describe($error)['description_key'], $trimmed);
    }

    private static function looksTechnical(string $value): bool
    {
        $patterns = [
            '/SQLSTATE\[/i',
            '/Stack trace:/i',
            '/Exception with message/i',
            '/\\\\[A-Z][A-Za-z0-9_]+::/',
            '/^#\d+\s/m',
            '/PDOException/i',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $value) === 1) {
                return true;
            }
        }

        return false;
    }

    private static function currentRequestId(): ?string
    {
        if (! app()->bound('request')) {
            return null;
        }

        $value = request()->headers->get('X-Request-Id');

        return is_string($value) && $value !== '' ? $value : null;
    }

    private static function mintRef(string $error, ?string $rawReason, ?Throwable $exception): string
    {
        $reference = 'SSOERR-'.Str::upper(Str::random(10));

        Log::warning('[SSO_ERROR_EMITTED]', [
            'error_ref' => $reference,
            'error_code' => $error,
            'request_id' => self::currentRequestId(),
            'reason_hash' => $rawReason !== null && $rawReason !== '' ? hash('sha256', $rawReason) : null,
            'exception' => $exception?->getMessage(),
            'exception_class' => $exception !== null ? $exception::class : null,
        ]);

        return $reference;
    }
}
