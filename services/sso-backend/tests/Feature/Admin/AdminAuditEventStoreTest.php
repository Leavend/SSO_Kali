<?php

declare(strict_types=1);

use App\Models\AdminAuditEvent;
use App\Services\Admin\AdminAuditEventStore;

it('chains immutable admin audit events in append-only storage', function (): void {
    $store = app(AdminAuditEventStore::class);

    $store->append(auditPayload('denied', 'admin_api'));
    $first = AdminAuditEvent::query()->orderBy('id')->firstOrFail();

    $store->append(auditPayload('succeeded', 'revoke_session'));
    $second = AdminAuditEvent::query()->orderByDesc('id')->firstOrFail();

    expect($first->previous_hash)->toBeNull()
        ->and($first->event_hash)->toBeString()
        ->and($first->event_hash === '')->toBeFalse()
        ->and($second->previous_hash)->toBe($first->event_hash)
        ->and($second->event_hash)->toBeString()
        ->and($second->event_hash === '')->toBeFalse();
});

it('prevents admin audit events from being updated or deleted', function (): void {
    $event = AdminAuditEvent::query()->create(auditPayload('denied', 'admin_api') + [
        'event_id' => '01JTABCDEF1234567890ABCDE1',
        'previous_hash' => null,
        'event_hash' => str_repeat('a', 64),
    ]);

    expect(fn () => $event->update(['action' => 'mutated']))
        ->toThrow(RuntimeException::class, 'immutable');

    expect(fn () => $event->delete())
        ->toThrow(RuntimeException::class, 'immutable');
});

/**
 * @return array<string, mixed>
 */
function auditPayload(string $outcome, string $action): array
{
    return [
        'action' => $action,
        'outcome' => $outcome,
        'taxonomy' => 'forbidden',
        'admin_subject_id' => 'admin-1',
        'admin_email' => 'admin@example.com',
        'admin_role' => 'admin',
        'method' => 'DELETE',
        'path' => 'admin/api/sessions/session-1',
        'ip_address' => '127.0.0.1',
        'reason' => 'policy',
        'context' => ['session_id' => 'session-1'],
        'occurred_at' => now(),
        'created_at' => now(),
    ];
}
