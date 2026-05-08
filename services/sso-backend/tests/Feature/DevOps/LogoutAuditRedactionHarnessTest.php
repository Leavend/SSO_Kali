<?php

declare(strict_types=1);

use App\Actions\Audit\RecordLogoutAuditEventAction;

it('redacts sensitive logout audit context recursively', function (): void {
    config(['logging.default' => 'single']);

    app(RecordLogoutAuditEventAction::class)->execute('harness_logout_event', [
        'client_id' => 'sso-admin-panel',
        'endpoint' => [
            'host' => 'client.example.test',
            'query' => [
                'logout_token' => 'must-not-leak',
                'client_secret' => 'must-not-leak',
                'password_hint' => 'must-not-leak',
            ],
        ],
    ]);

    $logFile = storage_path('logs/laravel.log');
    $content = is_file($logFile) ? (string) file_get_contents($logFile) : '';

    expect($content)->toContain('harness_logout_event')
        ->and($content)->toContain('sso-admin-panel')
        ->and($content)->toContain('client.example.test')
        ->and($content)->not->toContain('must-not-leak')
        ->and($content)->not->toContain('logout_token')
        ->and($content)->not->toContain('client_secret')
        ->and($content)->not->toContain('password_hint');
});
