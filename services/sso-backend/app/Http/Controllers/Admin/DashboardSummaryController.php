<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Services\Admin\AdminDashboardSummaryService;
use Illuminate\Http\JsonResponse;

final class DashboardSummaryController
{
    public function __construct(private readonly AdminDashboardSummaryService $summary) {}

    public function __invoke(): JsonResponse
    {
        return response()->json($this->summary->snapshot())
            ->header('Cache-Control', 'no-store')
            ->header('Pragma', 'no-cache');
    }
}
