<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Admin\ExportAdminAuditEventsAction;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

final class AuditTrailExportController
{
    public function __invoke(Request $request, ExportAdminAuditEventsAction $action): StreamedResponse
    {
        $filters = $request->validate([
            'format' => ['required', 'in:csv,jsonl'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'action' => ['nullable', 'string', 'max:64'],
            'outcome' => ['nullable', 'in:succeeded,denied,failed'],
            'taxonomy' => ['nullable', 'string', 'max:64'],
            'admin_subject_id' => ['nullable', 'string', 'max:64'],
        ]);

        return $action->execute($request, $filters);
    }
}
