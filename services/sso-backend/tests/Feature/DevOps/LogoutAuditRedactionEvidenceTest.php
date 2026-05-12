<?php

declare(strict_types=1);

use App\Actions\Audit\RecordLogoutAuditEventAction;

it('redacts sensitive logout audit context recursively', function (): void {
    config(['logging.default' => 'single']);

    // Truncate the log before running this test so assertions reflect only
    // the output of this call path, not cumulative content from other tests
    // in the suite that legitimately log 'client_secret' (e.g.
    // AuthLogRedactionProcessorTest, RecordSsoErrorActionTest).
    $logFile = storage_path('logs/laravel.log');
    if (is_file($logFile)) {
        file_put_contents($logFile, '');
    }

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

    $content = is_file($logFile) ? (string) file_get_contents($logFile) : '';

    expect($content)->toContain('harness_logout_event')
        ->and($content)->toContain('sso-admin-panel')
        ->and($content)->toContain('client.example.test')
        ->and($content)->not->toContain('must-not-leak')
        ->and($content)->not->toContain('logout_token')
        ->and($content)->not->toContain('client_secret')
        ->and($content)->not->toContain('password_hint');
});
