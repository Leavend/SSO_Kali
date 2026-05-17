<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Artisan;

it('schedules automated data subject request fulfilment queueing', function (): void {
    Artisan::call('schedule:list');

    expect(Artisan::output())
        ->toContain('sso:queue-dsr-fulfillments')
        ->toContain('*/10 * * * *');
});
