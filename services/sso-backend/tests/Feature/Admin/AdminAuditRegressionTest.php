<?php

declare(strict_types=1);

use App\Models\AdminAuditEvent;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\Admin\AdminAuditTrailPresenter;
use App\Services\Admin\AdminAuditIntegrityVerifier;
use Database\Seeders\RbacSeeder;
use Illuminate\Support\Facades\Log;

beforeEach(function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-backend');
    config()->set('sso.admin.mfa.enforced', false);
    $this->seed(RbacSeeder::class);
});

it('handles non-associative/integer key arrays in context without throwing TypeError', function (): void {
    $store = app(AdminAuditEventStore::class);
    $presenter = app(AdminAuditTrailPresenter::class);

    $store->append([
        'action' => 'sync_user_roles',
        'outcome' => 'succeeded',
        'taxonomy' => 'role_sync',
        'admin_subject_id' => 'admin-1',
        'admin_email' => 'admin@example.com',
        'admin_role' => 'admin',
        'method' => 'POST',
        'path' => 'admin/api/roles',
        'ip_address' => '127.0.0.1',
        'reason' => 'normal sync',
        'context' => [
            'role_slugs' => ['user', 'moderator'], // non-associative, keys are 0, 1
            'nested' => [
                'some_list' => ['item1', 'item2']
            ]
        ],
        'occurred_at' => now(),
    ]);

    $event = AdminAuditEvent::query()->latest('id')->firstOrFail();
    $formatted = $presenter->event($event);

    expect($formatted['context']['role_slugs'])->toBe(['user', 'moderator'])
        ->and($formatted['context']['nested']['some_list'])->toBe(['item1', 'item2']);
});

it('sanitizes invalid UTF-8 characters when writing to DB without breaking hash-chain verification', function (): void {
    $store = app(AdminAuditEventStore::class);
    $presenter = app(AdminAuditTrailPresenter::class);

    $invalidUtf8String = "Invalid UTF-8: " . "\xC2\xA0\x9F" . " and \xFF";

    $store->append([
        'action' => 'user.update',
        'outcome' => 'succeeded',
        'taxonomy' => 'user_lifecycle',
        'admin_subject_id' => 'admin-1',
        'admin_email' => 'admin@example.com',
        'admin_role' => 'admin',
        'method' => 'POST',
        'path' => 'admin/api/users',
        'ip_address' => '127.0.0.1',
        'reason' => $invalidUtf8String,
        'context' => [
            'bad_key_' . "\xFF" => 'bad_value_' . $invalidUtf8String,
        ],
        'occurred_at' => now(),
    ]);

    $event = AdminAuditEvent::query()->latest('id')->firstOrFail();
    $formatted = $presenter->event($event);

    expect($event->reason)->not->toContain("\xFF")
        ->and($formatted['reason'])->not->toContain("\xFF");

    $verifier = app(AdminAuditIntegrityVerifier::class);
    $result = $verifier->verify();
    expect($result['valid'])->toBeTrue();
});

it('implements fail-soft per-baris and lists skipped_events in collection pagination', function (): void {
    $store = app(AdminAuditEventStore::class);
    $presenter = app(AdminAuditTrailPresenter::class);

    $event1 = new AdminAuditEvent([
        'event_id' => 'EVT01',
        'action' => 'action1',
        'outcome' => 'succeeded',
        'taxonomy' => 'tax',
        'admin_subject_id' => 'admin-1',
        'admin_email' => 'admin@example.com',
        'admin_role' => 'admin',
        'method' => 'GET',
        'path' => 'path1',
        'ip_address' => '127.0.0.1',
        'reason' => 'reason1',
        'context' => ['val' => 'ok'],
        'occurred_at' => now(),
    ]);

    // Use setRawAttributes to prevent casting from executing inside constructor
    $corruptEvent = new AdminAuditEvent();
    $corruptEvent->setRawAttributes([
        'event_id' => 'EVT02',
        'action' => 'action2',
        'outcome' => 'succeeded',
        'taxonomy' => 'tax',
        'admin_subject_id' => 'admin-1',
        'admin_email' => 'admin@example.com',
        'admin_role' => 'admin',
        'method' => 'GET',
        'path' => 'path2',
        'ip_address' => '127.0.0.1',
        'reason' => 'reason2',
        'context' => ['val' => 'error'],
        'occurred_at' => 'this-is-not-a-valid-date-causes-carbon-exception-on-access',
    ]);

    $items = collect([$event1, $corruptEvent]);
    $paginator = new \Illuminate\Pagination\CursorPaginator(
        $items,
        50,
        null,
        []
    );

    Log::shouldReceive('warning')
        ->once()
        ->with('[AUDIT_PRESENT_FAILED]', Mockery::on(function ($arg) {
            return $arg['event_id'] === 'EVT02';
        }));
    Log::shouldReceive('log');

    $result = $presenter->collection($paginator);

    expect($result['events'])->toHaveLength(1)
        ->and($result['events'][0]['event_id'])->toBe('EVT01')
        ->and($result['pagination']['skipped_events'])->toBe(1);
});
