<?php

declare(strict_types=1);

namespace App\Support\Responses;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;

final class OidcErrorResponse
{
    public static function json(
        string $error,
        string $description,
        int $status,
        ?string $errorRef = null,
        ?string $requestId = null,
    ): JsonResponse {
        $payload = [
            'error' => $error,
            'error_description' => $description,
        ];

        if (is_string($errorRef) && $errorRef !== '') {
            $payload['error_ref'] = $errorRef;
        }

        if (is_string($requestId) && $requestId !== '') {
            $payload['request_id'] = $requestId;
        }

        $headers = [
            'Cache-Control' => 'no-store',
            'Pragma' => 'no-cache',
        ];

        if (is_string($errorRef) && $errorRef !== '') {
            $headers['X-Error-Ref'] = $errorRef;
        }

        return response()->json($payload, $status)->withHeaders($headers);
    }

    public static function redirect(
        string $redirectUri,
        string $error,
        string $description,
        ?string $state,
    ): RedirectResponse {
        $query = array_filter([
            'error' => $error,
            'error_description' => $description,
            'state' => $state,
        ], static fn (?string $value): bool => $value !== null);

        $separator = str_contains($redirectUri, '?') ? '&' : '?';

        return redirect()->away($redirectUri.$separator.http_build_query($query));
    }
}
