<?php

declare(strict_types=1);

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('telescope:prune --hours='.(int) config('telescope.prune_hours', 48))->daily();
Schedule::command('sso:prune-tokens')->daily();
Schedule::command('sso:prune-authentication-audit-events')->daily();
Schedule::command('sso:prune-authorization-codes')->hourly();
Schedule::command('sso:check-secret-expiry')->daily();
