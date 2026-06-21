<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Services\Admin\AdminObservabilitySummaryService;
use Illuminate\Http\JsonResponse;

final class ObservabilitySummaryController
{
    public function __construct(private readonly AdminObservabilitySummaryService $summary) {}

    public function __invoke(): JsonResponse
    {
        return response()->json($this->summary->snapshot())
            ->header('Cache-Control', 'no-store')
            ->header('Pragma', 'no-cache');
    }
}
