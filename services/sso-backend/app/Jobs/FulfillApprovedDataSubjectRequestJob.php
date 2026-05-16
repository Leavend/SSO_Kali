<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Actions\DataSubject\FulfillDataSubjectRequestAction;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Http\Request;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

final class FulfillApprovedDataSubjectRequestJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    public int $timeout = 90;

    public function __construct(
        public readonly string $requestId,
        public readonly int $reviewerUserId,
        public readonly string $requestIp = '127.0.0.1',
        public readonly ?string $requestIdHeader = null,
    ) {
        $this->onQueue('data-subject-requests');
    }

    public function handle(FulfillDataSubjectRequestAction $fulfill): void
    {
        $fulfill->execute($this->requestId, $this->reviewer(), $this->auditRequest(), false);
    }

    /**
     * @return list<string>
     */
    public function tags(): array
    {
        return ['data-subject-request', 'request:'.$this->requestId];
    }

    private function reviewer(): User
    {
        return User::query()->findOrFail($this->reviewerUserId);
    }

    private function auditRequest(): Request
    {
        $request = Request::create('/system/data-subject-requests/'.$this->requestId.'/fulfill', 'POST', server: [
            'REMOTE_ADDR' => $this->requestIp,
        ]);
        $request->headers->set('X-Request-Id', $this->requestIdHeader ?? 'queued-dsr-'.$this->requestId);

        return $request;
    }
}
