<?php

declare(strict_types=1);

namespace App\Http\Controllers\System;

use App\Support\Responses\ClientJsonResponse;
use Illuminate\Http\JsonResponse;

final class HealthController
{
    public function __invoke(): JsonResponse
    {
        return ClientJsonResponse::ok([
            'healthy' => true,
        ]);
    }
}
