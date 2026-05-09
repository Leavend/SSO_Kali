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
    ): JsonResponse {
        return response()->json([
            'error' => $error,
            'error_description' => $description,
        ], $status)->withHeaders([
            'Cache-Control' => 'no-store',
            'Pragma' => 'no-cache',
        ]);
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
