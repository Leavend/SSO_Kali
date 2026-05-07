<?php

declare(strict_types=1);

namespace App\Http\Controllers\System;

use Illuminate\Http\JsonResponse;

final class HealthController
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'service' => 'sso-backend',
            'healthy' => true,
        ]);
    }
}
