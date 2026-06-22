<?php

declare(strict_types=1);

use App\Models\AdminAuditEvent;
use App\Models\AuthenticationAuditEvent;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Admin\AdminObservabilitySummaryService;
use App\Services\Oidc\LocalTokenService;
use App\Services\System\ReadinessProbeService;
use App\Services\System\ServiceHealthProbeService;
use App\Services\System\ServiceHealthProbeTarget;
use App\Support\Rbac\AdminPermission;
use Database\Seeders\RbacSeeder;
use GuzzleHttp\Psr7\Response as Psr7Response;
use Illuminate\Cache\ArrayStore;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

beforeEach(function (): void {
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-backend');
    config()->set('sso.admin.mfa.enforced', false);
    config()->set('oidc_clients.clients.app-a.allowed_scopes', ['openid', 'profile', 'email', 'roles', 'permissions']);

    config()->set('sso.observability.targets.portal_url', 'https://portal.example.test/healthz');
    config()->set('sso.observability.targets.admin_url', 'https://admin.example.test/healthz');
    config()->set('sso.observability.targets.backend_url', 'https://backend.example.test/health');
    config()->set('sso.observability.probe_cache_ttl_healthy_seconds', 30);
    config()->set('sso.observability.probe_cache_ttl_failure_seconds', 3);
    config()->set('sso.observability.probe_timeout_seconds', 3);
    config()->set('sso.observability.probe_degraded_latency_ms', 1000);
    config()->set('sso.observability.probe_log_throttle_seconds', 60);
    config()->set('sso.observability.summary_metrics_cache_ttl_seconds', 30);
    config()->set('sso.observability.recent_events_cache_ttl_seconds', 5);
    clearObservabilityProbeCache();

    $this->seed(RbacSeeder::class);
});

it('requires explicit observability permission', function (): void {
    $admin = observabilityAdmin([AdminPermission::AUDIT_READ]);

    $this->getJson('/admin/api/observability/summary', observabilityHeaders($admin))
        ->assertStatus(403);
});

it('returns a safe no-store observability summary for the three SSO services', function (): void {
    mockObservabilityReadiness();
    Http::fake([
        'https://portal.example.test/healthz' => Http::response('ok', 200),
        'https://admin.example.test/healthz' => Http::response('ok', 200),
        'https://backend.example.test/health' => Http::response(['healthy' => true], 200),
    ]);

    $admin = observabilityAdmin([AdminPermission::OBSERVABILITY_READ]);

    AdminAuditEvent::query()->create([
        'event_id' => '01JOBSADMIN000000000000001',
        'action' => 'admin_api',
        'outcome' => 'denied',
        'taxonomy' => 'forbidden',
        'admin_subject_id' => $admin->subject_id,
        'admin_email' => $admin->email,
        'admin_role' => 'admin',
        'method' => 'GET',
        'path' => '/admin/api/users',
        'ip_address' => '127.0.0.1',
        'reason' => 'policy',
        'context' => ['access_token' => 'secret-token-value'],
        'request_id' => 'req-observability-admin-123456',
        'support_reference' => 'REF-IN123456',
        'occurred_at' => now(),
        'previous_hash' => null,
        'event_hash' => str_repeat('a', 64),
        'signing_key_id' => 'testing',
    ]);

    AuthenticationAuditEvent::query()->create([
        'event_id' => '01JOBSAUTH0000000000000001',
        'event_type' => 'login_failed',
        'outcome' => 'failed',
        'subject_id' => 'usr-observability',
        'email' => 'user@example.test',
        'client_id' => 'sso-portal',
        'session_id' => 'sid-observability',
        'ip_address' => '127.0.0.1',
        'user_agent' => 'test',
        'error_code' => 'invalid_credentials',
        'request_id' => 'req-observability-auth-654321',
        'context' => ['password' => 'secret-password-value'],
        'occurred_at' => now(),
        'created_at' => now(),
    ]);

    $response = $this->getJson('/admin/api/observability/summary', observabilityHeaders($admin));

    $response->assertOk()
        ->assertJsonStructure([
            'generated_at',
            'partial',
            'degraded',
            'services' => [['key', 'name', 'status', 'summary', 'latency_p95_ms', 'freshness_seconds']],
            'metrics' => ['window_seconds', 'freshness_seconds', 'queue', 'performance', 'auth_funnel', 'admin_activity'],
            'freshness' => ['recent_events_seconds'],
            'logs' => [['service', 'severity', 'message', 'reference', 'occurred_at']],
            'traces' => ['status', 'reason', 'next_step', 'last_seen_trace_id'],
        ])
        ->assertJsonPath('traces.status', 'unavailable');

    expect($response->headers->get('Cache-Control'))->toContain('no-store');
    expect(collect($response->json('services'))->pluck('key')->all())
        ->toBe(['sso-backend', 'sso-portal', 'admin-sso']);
    expect($response->json('services.0'))->not->toHaveKey('request_rate_per_min')
        ->and($response->json('services.0'))->not->toHaveKey('error_rate_percent')
        ->and($response->json('services.0.status'))->toBe('healthy')
        ->and($response->json('services.1.status'))->toBe('healthy')
        ->and($response->json('services.2.status'))->toBe('healthy')
        ->and($response->json('services.0.freshness_seconds'))->toBe(0)
        ->and($response->json('metrics.freshness_seconds'))->toBe(30)
        ->and($response->json('freshness.recent_events_seconds'))->toBe(5);

    $payload = json_encode($response->json(), JSON_THROW_ON_ERROR);
    expect($payload)->not->toContain('secret-token-value')
        ->and($payload)->not->toContain('secret-password-value')
        ->and($payload)->not->toContain('sid-observability');
});

it('properly reports degraded and down states for service targets when health probes fail', function (): void {
    $admin = observabilityAdmin([AdminPermission::OBSERVABILITY_READ]);

    $mockReadiness = Mockery::mock(ReadinessProbeService::class);
    $mockReadiness->shouldReceive('inspect')->andReturn([
        'ready' => false,
        'checks' => ['database' => false, 'redis' => true],
    ]);
    $this->instance(ReadinessProbeService::class, $mockReadiness);

    Http::fake([
        'https://portal.example.test/healthz' => Http::response('found', 302),
        'https://admin.example.test/healthz' => Http::response('internal server error', 500),
    ]);

    $response = $this->getJson('/admin/api/observability/summary', observabilityHeaders($admin));

    $response->assertOk();

    $services = $response->json('services');

    $backend = collect($services)->firstWhere('key', 'sso-backend');
    $portal = collect($services)->firstWhere('key', 'sso-portal');
    $adminSso = collect($services)->firstWhere('key', 'admin-sso');

    expect($backend['status'])->toBe('degraded')
        ->and($backend['summary'])->toContain('Readiness checks require attention');

    expect($portal['status'])->toBe('degraded')
        ->and($portal['summary'])->toContain('Portal BFF is degraded')
        ->and($portal['summary'])->toContain('Redirect response: 302');

    expect($adminSso['status'])->toBe('down')
        ->and($adminSso['summary'])->toContain('Admin BFF is unreachable')
        ->and($adminSso['summary'])->toContain('Server error response: 500')
        ->and($adminSso['checks']['api'])->toBeFalse();
});

it('reports unconfigured targets as unknown instead of outages', function (): void {
    config()->set('sso.observability.targets.portal_url', null);
    clearObservabilityProbeTarget(ServiceHealthProbeTarget::Portal);

    Http::fake([
        'https://admin.example.test/healthz' => Http::response('ok', 200),
    ]);

    $admin = observabilityAdmin([AdminPermission::OBSERVABILITY_READ]);

    $response = $this->getJson('/admin/api/observability/summary', observabilityHeaders($admin));

    $response->assertOk();

    $portal = collect($response->json('services'))->firstWhere('key', 'sso-portal');

    expect($portal['status'])->toBe('unknown')
        ->and($portal['summary'])->toContain('observability target is not configured')
        ->and($portal['summary'])->not->toContain('degraded')
        ->and($portal['summary'])->not->toContain('unreachable');
});

it('caches failed service health probes with the failure ttl', function (): void {
    $requests = 0;
    Http::fake([
        'https://admin.example.test/healthz' => function () use (&$requests) {
            $requests++;

            return Http::response('internal server error', 500);
        },
    ]);

    $probe = app(ServiceHealthProbeService::class);

    $first = $probe->probe('admin-sso');
    $second = $probe->probe('admin-sso');

    expect($first['status'])->toBe('down')
        ->and($second)->toBe($first)
        ->and($requests)->toBe(1);
});

it('caches slow degraded service health probes with the failure ttl', function (): void {
    $probe = app(ServiceHealthProbeService::class);
    $classifier = Closure::bind(
        fn () => $this->classify(
            'admin-sso',
            new Response(new Psr7Response(200, [], 'ok')),
            1250.0,
            30,
            3,
            1000,
        ),
        $probe,
        $probe::class,
    );

    [$result, $ttl] = $classifier();

    expect($result['status'])->toBe('degraded')
        ->and($result['freshness_seconds'])->toBe(3)
        ->and($ttl)->toBe(3);
});

it('floors invalid probe ttl config so failed probes still cache', function (): void {
    config()->set('sso.observability.probe_cache_ttl_healthy_seconds', 0);
    config()->set('sso.observability.probe_cache_ttl_failure_seconds', -10);
    clearObservabilityProbeCache();

    $requests = 0;
    Http::fake([
        'https://admin.example.test/healthz' => function () use (&$requests) {
            $requests++;

            return Http::response('service unavailable', 503);
        },
    ]);

    $probe = app(ServiceHealthProbeService::class);

    $first = $probe->probe('admin-sso');
    $second = $probe->probe('admin-sso');

    expect($first['status'])->toBe('down')
        ->and($first['freshness_seconds'])->toBe(1)
        ->and($second)->toBe($first)
        ->and($requests)->toBe(1);
});

it('floors invalid summary metrics and recent events ttl config values to 1', function (): void {
    config()->set('sso.observability.summary_metrics_cache_ttl_seconds', 0);
    config()->set('sso.observability.recent_events_cache_ttl_seconds', -5);
    clearObservabilityProbeCache();

    mockObservabilityReadiness();
    Http::fake([
        'https://portal.example.test/healthz' => Http::response('ok', 200),
        'https://admin.example.test/healthz' => Http::response('ok', 200),
        'https://backend.example.test/health' => Http::response(['healthy' => true], 200),
    ]);

    $admin = observabilityAdmin([AdminPermission::OBSERVABILITY_READ]);

    $response = $this->getJson('/admin/api/observability/summary', observabilityHeaders($admin));

    $response->assertOk()
        ->assertJsonPath('metrics.freshness_seconds', 1)
        ->assertJsonPath('freshness.recent_events_seconds', 1);
});

it('logs service health connection failures without stack traces', function (): void {
    Log::spy();
    Http::fake([
        'https://admin.example.test/healthz' => function (): void {
            throw new RuntimeException('connection refused');
        },
    ]);

    $result = app(ServiceHealthProbeService::class)->probe('admin-sso');

    Log::shouldHaveReceived('warning')
        ->once()
        ->with('[SERVICE_HEALTH_PROBE_ERROR]', Mockery::on(function (array $context): bool {
            return ($context['key'] ?? null) === 'admin-sso'
                && ($context['exception'] ?? null) === RuntimeException::class
                && ($context['error'] ?? null) === 'connection refused'
                && ! array_key_exists('trace', $context);
        }));

    expect($result['status'])->toBe('down')
        ->and($result['latency_ms'])->toBeNull();
});

it('reports pool setup failures as degraded probe subsystem failures', function (): void {
    clearObservabilityProbeCache();
    Http::shouldReceive('pool')
        ->once()
        ->andThrow(new RuntimeException('pool unavailable'));

    $probe = app(ServiceHealthProbeService::class);

    $results = $probe->probeMany(['sso-portal', 'admin-sso']);

    expect($results['sso-portal']['status'])->toBe('degraded')
        ->and($results['sso-portal']['error'])->toBe('Health probe subsystem failed before target response.')
        ->and($results['admin-sso']['status'])->toBe('degraded')
        ->and($results['admin-sso']['error'])->toBe('Health probe subsystem failed before target response.');
});

it('summarizes pool setup failures as probe subsystem degradation', function (): void {
    mockObservabilityReadiness();
    clearObservabilityProbeCache();
    Http::shouldReceive('pool')
        ->once()
        ->andThrow(new RuntimeException('pool unavailable'));

    $admin = observabilityAdmin([AdminPermission::OBSERVABILITY_READ]);

    $response = $this->getJson('/admin/api/observability/summary', observabilityHeaders($admin))->assertOk();

    $portal = collect($response->json('services'))->firstWhere('key', ServiceHealthProbeTarget::Portal->value);
    $adminSso = collect($response->json('services'))->firstWhere('key', ServiceHealthProbeTarget::Admin->value);

    expect($portal['status'])->toBe('degraded')
        ->and($portal['summary'])->toContain('Health probe subsystem degraded')
        ->and($portal['summary'])->not->toContain('not configured')
        ->and($portal['summary'])->not->toContain('is unreachable')
        ->and($adminSso['summary'])->toContain('Health probe subsystem degraded')
        ->and($adminSso['summary'])->not->toContain('is unreachable');
});

it('caches summary activity metrics and does not rescan audit counts on every summary request', function (): void {
    mockObservabilityReadiness();
    Http::fake([
        'https://portal.example.test/healthz' => Http::response('ok', 200),
        'https://admin.example.test/healthz' => Http::response('ok', 200),
    ]);

    $admin = observabilityAdmin([AdminPermission::OBSERVABILITY_READ]);

    AuthenticationAuditEvent::query()->create([
        'event_id' => '01JOBSCACHEAUTH000000000001',
        'event_type' => 'login_succeeded',
        'outcome' => 'succeeded',
        'subject_id' => 'usr-observability-cache',
        'email' => 'cache@example.test',
        'client_id' => 'sso-portal',
        'session_id' => 'sid-observability-cache',
        'ip_address' => '127.0.0.1',
        'user_agent' => 'test',
        'error_code' => null,
        'request_id' => 'req-observability-cache-auth',
        'context' => [],
        'occurred_at' => now(),
        'created_at' => now(),
    ]);

    AdminAuditEvent::query()->create([
        'event_id' => '01JOBSCACHEADMIN0000000001',
        'action' => 'admin_api',
        'outcome' => 'allowed',
        'taxonomy' => 'read',
        'admin_subject_id' => $admin->subject_id,
        'admin_email' => $admin->email,
        'admin_role' => 'admin',
        'method' => 'GET',
        'path' => '/admin/api/observability/summary',
        'ip_address' => '127.0.0.1',
        'reason' => null,
        'context' => [],
        'request_id' => 'req-observability-cache-admin',
        'support_reference' => 'REF-CACHE01',
        'occurred_at' => now(),
        'previous_hash' => null,
        'event_hash' => str_repeat('b', 64),
        'signing_key_id' => 'testing',
    ]);

    $first = $this->getJson('/admin/api/observability/summary', observabilityHeaders($admin))->assertOk();

    AuthenticationAuditEvent::query()->create([
        'event_id' => '01JOBSCACHEAUTH000000000002',
        'event_type' => 'login_failed',
        'outcome' => 'failed',
        'subject_id' => 'usr-observability-cache-2',
        'email' => 'cache2@example.test',
        'client_id' => 'sso-portal',
        'session_id' => 'sid-observability-cache-2',
        'ip_address' => '127.0.0.1',
        'user_agent' => 'test',
        'error_code' => 'invalid_credentials',
        'request_id' => 'req-observability-cache-auth-2',
        'context' => [],
        'occurred_at' => now(),
        'created_at' => now(),
    ]);

    $second = $this->getJson('/admin/api/observability/summary', observabilityHeaders($admin))->assertOk();

    expect($first->json('metrics.auth_funnel'))->toBe($second->json('metrics.auth_funnel'))
        ->and($first->json('metrics.admin_activity'))->toBe($second->json('metrics.admin_activity'))
        ->and($first->json('logs'))->toBe($second->json('logs'))
        ->and($first->json('metrics.freshness_seconds'))->toBe(30)
        ->and($first->json('freshness.recent_events_seconds'))->toBe(5);
});

it('orders recent correlated events deterministically when timestamps tie', function (): void {
    mockObservabilityReadiness();
    Http::fake([
        'https://portal.example.test/healthz' => Http::response('ok', 200),
        'https://admin.example.test/healthz' => Http::response('ok', 200),
    ]);

    $admin = observabilityAdmin([AdminPermission::OBSERVABILITY_READ]);
    $occurredAt = now()->subMinute();

    AdminAuditEvent::query()->create([
        'event_id' => '01JOBSSORTADMIN0000000001',
        'action' => 'admin_api',
        'outcome' => 'allowed',
        'taxonomy' => 'read',
        'admin_subject_id' => $admin->subject_id,
        'admin_email' => $admin->email,
        'admin_role' => 'admin',
        'method' => 'GET',
        'path' => '/admin/api/observability/summary',
        'ip_address' => '127.0.0.1',
        'reason' => null,
        'context' => [],
        'request_id' => 'req-observability-sort-admin',
        'support_reference' => 'REF-SORT001',
        'occurred_at' => $occurredAt,
        'previous_hash' => null,
        'event_hash' => str_repeat('c', 64),
        'signing_key_id' => 'testing',
    ]);

    AuthenticationAuditEvent::query()->create([
        'event_id' => '01JOBSSORTAUTH00000000001',
        'event_type' => 'login_failed',
        'outcome' => 'failed',
        'subject_id' => 'usr-observability-sort',
        'email' => 'sort@example.test',
        'client_id' => 'sso-portal',
        'session_id' => 'sid-observability-sort',
        'ip_address' => '127.0.0.1',
        'user_agent' => 'test',
        'error_code' => 'invalid_credentials',
        'request_id' => 'req-observability-sort-auth',
        'context' => [],
        'occurred_at' => $occurredAt,
        'created_at' => $occurredAt,
    ]);

    clearObservabilityProbeCache();
    $logs = app(AdminObservabilitySummaryService::class)->snapshot()['logs'];

    expect(array_column(array_slice($logs, 0, 2), 'id'))->toBe([
        '01JOBSSORTAUTH00000000001',
        '01JOBSSORTADMIN0000000001',
    ]);
});

function observabilityAdmin(array $permissions): User
{
    $user = User::factory()->create([
        'subject_id' => 'observability-admin-'.substr(md5(json_encode($permissions, JSON_THROW_ON_ERROR)), 0, 8),
        'role' => 'admin',
    ]);
    $role = Role::query()->create(['slug' => 'observability-role-'.uniqid(), 'name' => 'Observability Role']);
    $permissionIds = Permission::query()->whereIn('slug', $permissions)->pluck('id')->all();
    $role->permissions()->sync($permissionIds);
    $user->roles()->sync([$role->id]);

    return $user;
}

/**
 * @return array<string, string>
 */
function observabilityHeaders(User $user): array
{
    $tokens = app(LocalTokenService::class)->issue([
        'subject_id' => $user->subject_id,
        'client_id' => 'app-a',
        'scope' => 'openid profile email roles permissions',
        'session_id' => 'observability-session',
        'auth_time' => time(),
        'amr' => ['pwd'],
    ]);

    return ['Authorization' => 'Bearer '.$tokens['access_token']];
}

function clearObservabilityProbeCache(): void
{
    $store = Cache::getStore();
    if ($store instanceof ArrayStore) {
        $ref = new ReflectionObject($store);
        $prop = $ref->getProperty('storage');
        $prop->setAccessible(true);
        $storage = $prop->getValue($store);
        foreach (array_keys($storage) as $key) {
            if (str_starts_with((string) $key, 'service_health_probe:') ||
                str_starts_with((string) $key, 'service_health_probe_log:')) {
                Cache::forget((string) $key);
            }
        }
    } else {
        Cache::flush();
    }
    Cache::forget('admin_observability_summary:auth_funnel');
    Cache::forget('admin_observability_summary:admin_activity');
    Cache::forget('admin_observability_summary:recent_events');
}

function clearObservabilityProbeTarget(ServiceHealthProbeTarget $target): void
{
    Cache::forget($target->cacheKey());
}

function clearObservabilityProbeLogThrottle(string $key, string $exceptionClass, string $message): void
{
    Cache::forget('service_health_probe_log:'.sha1($key.'|'.$exceptionClass.'|'.$message));
}

/**
 * @param  array<string, bool>  $checks
 */
function mockObservabilityReadiness(bool $ready = true, array $checks = ['database' => true, 'redis' => true]): void
{
    $mockReadiness = Mockery::mock(ReadinessProbeService::class);
    $mockReadiness->shouldReceive('inspect')->andReturn([
        'ready' => $ready,
        'checks' => $checks,
    ]);

    app()->instance(ReadinessProbeService::class, $mockReadiness);
}
