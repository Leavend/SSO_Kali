<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Services\Admin\AdminRetentionStatusService;
use Illuminate\Http\JsonResponse;

final class RetentionStatusController
{
    public function __invoke(AdminRetentionStatusService $retention): JsonResponse
    {
        return response()
            ->json(['retention' => $retention->summary()])
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
            ->header('Pragma', 'no-cache');
    }
}
