<?php

declare(strict_types=1);

use App\Logging\AuthLogRedactionProcessor;
use Monolog\Level;
use Monolog\LogRecord;

it('redacts credential-like fields from messages, context, and nested payloads', function (): void {
    $processor = new AuthLogRedactionProcessor;
    $record = new LogRecord(
        new DateTimeImmutable('2026-04-05T00:00:00+00:00'),
        'testing',
        Level::Error,
        'login failed password=hunter2 client_secret=sso-secret',
        [
            'password' => 'hunter2',
            'client_secret' => 'sso-secret',
            'identifier' => 'admin@example.com',
            'nested' => [
                'refresh_token' => 'refresh-value',
                'note' => '{"password":"top-secret"}',
            ],
        ],
        [
            'authorization' => 'Bearer secret-token',
        ],
    );

    $sanitized = $processor($record);

    expect($sanitized->message)->toContain('password=[REDACTED]')
        ->toContain('client_secret=[REDACTED]')
        ->not->toContain('hunter2')
        ->not->toContain('sso-secret')
        ->and($sanitized->context['password'])->toBe('[REDACTED]')
        ->and($sanitized->context['client_secret'])->toBe('[REDACTED]')
        ->and($sanitized->context['identifier'])->toBe('admin@example.com')
        ->and($sanitized->context['nested']['refresh_token'])->toBe('[REDACTED]')
        ->and($sanitized->context['nested']['note'])->toContain('[REDACTED]')
        ->and($sanitized->extra['authorization'])->toBe('[REDACTED]');
});
