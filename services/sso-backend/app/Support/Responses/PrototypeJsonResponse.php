<?php

declare(strict_types=1);

namespace App\Support\Responses;

use Illuminate\Http\JsonResponse;

final class PrototypeJsonResponse
{
    /**
     * @param  array<string, mixed>  $data
     */
    public static function ok(array $data, int $status = 200): JsonResponse
    {
        return response()->json([
            'status' => 'ok',
            'phase' => 'setup',
            'data' => $data,
        ], $status);
    }
}
