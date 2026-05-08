<?php

declare(strict_types=1);

use App\Jobs\DispatchBackChannelLogoutJob;

it('keeps back-channel logout failure retry bounded and auditable', function (): void {
    $job = new DispatchBackChannelLogoutJob(
        'sso-load-test-client',
        'subject-harness',
        'sid-harness',
        'https://client.example.test/backchannel/logout?access_token=must-not-leak',
    );

    expect($job->tries)->toBe(3)
        ->and($job->backoff())->toBe([10, 30, 90]);
});
