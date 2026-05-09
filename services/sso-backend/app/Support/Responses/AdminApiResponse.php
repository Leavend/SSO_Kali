<?php

declare(strict_types=1);

namespace App\Support\Responses;

use Illuminate\Http\JsonResponse;

final class AdminApiResponse
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public static function ok(array $payload, int $status = 200): JsonResponse
    {
        return response()->json($payload, $status);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public static function created(array $payload): JsonResponse
    {
        return self::ok($payload, 201);
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    public static function error(string $code, string $message, int $status, array $extra = []): JsonResponse
    {
        return response()->json([
            'error' => $code,
            'message' => $message,
            ...$extra,
        ], $status);
    }

    public static function noContent(): JsonResponse
    {
        return response()->json(status: 204);
    }
}
