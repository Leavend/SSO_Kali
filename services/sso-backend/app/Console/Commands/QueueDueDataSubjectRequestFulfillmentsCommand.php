<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Jobs\FulfillApprovedDataSubjectRequestJob;
use App\Models\DataSubjectRequest;
use App\Models\User;
use App\Services\DataSubject\DataSubjectRequestService;
use Illuminate\Console\Command;

final class QueueDueDataSubjectRequestFulfillmentsCommand extends Command
{
    protected $signature = 'sso:queue-dsr-fulfillments {--limit=100}';

    protected $description = 'Queue approved data subject requests for automated fulfilment';

    public function handle(): int
    {
        $reviewer = $this->systemReviewer();
        if (! $reviewer instanceof User) {
            return self::FAILURE;
        }

        $queued = 0;
        foreach ($this->approvedRequests() as $request) {
            FulfillApprovedDataSubjectRequestJob::dispatch($request->request_id, $reviewer->id);
            $queued++;
        }

        $this->info("Queued {$queued} data subject request fulfilment job(s).");

        return self::SUCCESS;
    }

    private function systemReviewer(): ?User
    {
        $user = User::query()->where('subject_id', config('sso.seed.dsr_automation_subject_id', 'system-dsr-automation'))->first();
        if ($user instanceof User) {
            return $user;
        }

        $this->error('system-dsr-automation user is required before queueing DSR fulfilments.');

        return null;
    }

    /**
     * @return iterable<int, DataSubjectRequest>
     */
    private function approvedRequests(): iterable
    {
        $limit = max(1, (int) $this->option('limit'));

        return DataSubjectRequest::query()
            ->where('status', DataSubjectRequestService::STATUS_APPROVED)
            ->orderBy('id')
            ->limit($limit)
            ->get();
    }
}
