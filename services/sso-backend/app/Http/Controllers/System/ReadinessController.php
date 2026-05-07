<?php

declare(strict_types=1);

namespace App\Http\Controllers\System;

use App\Actions\System\InspectReadinessAction;
use Illuminate\Http\JsonResponse;

final class ReadinessController
{
    public function __construct(
        private readonly InspectReadinessAction $inspectReadiness,
    ) {}

    public function __invoke(): JsonResponse
    {
        $result = $this->inspectReadiness->execute();

        return response()->json($result, $result['ready'] ? 200 : 503);
    }
}
