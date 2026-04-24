<?php

declare(strict_types=1);

namespace App\Support\Responses;

use Illuminate\Http\JsonResponse;

final class ClientJsonResponse
{
    /**
     * @param  array<string, mixed>  $data
     */
    public static function ok(array $data, int $status = 200): JsonResponse
    {
        return response()->json([
            'status' => 'ok',
            'client' => 'app-b-laravel',
            'data' => $data,
        ], $status);
    }
}
