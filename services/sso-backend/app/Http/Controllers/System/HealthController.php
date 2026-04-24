<?php

declare(strict_types=1);

namespace App\Http\Controllers\System;

use App\Support\Responses\PrototypeJsonResponse;
use Illuminate\Http\JsonResponse;

final class HealthController
{
    public function __invoke(): JsonResponse
    {
        return PrototypeJsonResponse::ok([
            'service' => 'sso-backend',
            'healthy' => true,
        ]);
    }
}
