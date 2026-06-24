<?php

declare(strict_types=1);

use App\Models\OidcClientRegistration;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\DeviceSessionRegistry;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\WidgetOriginPolicy;
use App\Services\Session\SsoSessionCookieFactory;
use App\Services\Session\SsoSessionService;
use Illuminate\Cookie\CookieValuePrefix;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

beforeEach(function (): void {
    config()->set('sso.base_url', 'https://sso.example.test');
    config()->set('sso.frontend_url', 'https://portal.example.test');
    config()->set('oidc_clients.clients', [
        'publik-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://publik.test/callback'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => true,
            'category' => 'publik',
            'app_base_url' => 'https://publik.test',
            'display_name' => 'Publik App',
        ],
        'unsafe-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://unsafe.test/callback'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => true,
            'category' => 'publik',
            'app_base_url' => 'javascript:alert(1)',
            'display_name' => 'Unsafe App',
        ],
        'kepegawaian-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://kepegawaian.test/callback'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => true,
            'category' => 'kepegawaian',
            'app_base_url' => 'https://kepegawaian.test',
            'display_name' => 'Kepegawaian App',
        ],
    ]);

    app(DownstreamClientRegistry::class)->flush();
    app(WidgetOriginPolicy::class)->flush();

    // Create Pegawai user (has entitlement to kepegawaian)
    $this->pegawai = User::factory()->create([
        'subject_id' => 'pegawai-1',
        'subject_uuid' => 'pegawai-1',
        'email' => 'pegawai@example.com',
        'password' => Hash::make('SecurePass123!'),
        'role' => 'pegawai',
        'display_name' => 'Pegawai Satu',
    ]);

    // Create Normal user (no entitlement to kepegawaian)
    $this->normal = User::factory()->create([
        'subject_id' => 'normal-1',
        'subject_uuid' => 'normal-1',
        'email' => 'normal@example.com',
        'password' => Hash::make('SecurePass123!'),
        'role' => 'user',
        'display_name' => 'Normal User',
    ]);
});

describe('SSO Account Widget Endpoints', function (): void {
    it('returns the widget javascript script with correct headers', function (): void {
        $response = $this->get('/widget/account.js');

        $response->assertStatus(200);
        $response->assertHeader('Content-Type', 'application/javascript');
        $response->assertHeader('Cache-Control', 'max-age=3600, public');
        expect($response->getContent())
            ->toContain('window.SSOAccount.mount = mount')
            ->toContain('data-mount')
            ->toContain('host.__ssoAccountWidget')
            ->toContain('const SSO_BACKEND_URL = "https://sso.example.test"')
            ->toContain("SSO_BACKEND_URL + '/widget/session'")
            ->toContain("SSO_BACKEND_URL + '/widget/switch'")
            ->toContain('/widget/account.css')
            ->not->toContain('position: fixed')
            ->not->toContain("document.createElement('style')");
    });

    it('returns hosted widget css with public cache headers', function (): void {
        $response = $this->get('/widget/account.css');

        $response->assertStatus(200);
        $response->assertHeader('Content-Type', 'text/css; charset=UTF-8');
        $response->assertHeader('Cache-Control', 'max-age=3600, public');
        expect($response->getContent())
            ->toContain('.sso-widget-bar')
            ->toContain('position: absolute')
            ->not->toContain('position: fixed');
    });

    it('uses configured backend url instead of the request host in widget javascript', function (): void {
        $response = $this->withHeader('Host', 'attacker.example.test')
            ->get('/widget/account.js');

        $response->assertStatus(200);
        expect($response->getContent())
            ->toContain('const SSO_BACKEND_URL = "https://sso.example.test"')
            ->toContain("SSO_BACKEND_URL + '/authorize")
            ->not->toContain('attacker.example.test');
    });

    it('returns unauthenticated session details when no cookie is present', function (): void {
        $response = $this->getJson('/widget/session');

        $response->assertStatus(200);
        expect($response->json())->toBe(['authenticated' => false]);
    });

    it('returns authenticated session details with masked email when logged in', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');
        $cookieName = app(SsoSessionCookieFactory::class)->name();

        $response = $this->withHeader('Cookie', $cookieName.'='.$session->session_id)
            ->getJson('/widget/session');

        $response->assertStatus(200);
        expect($response->json('authenticated'))->toBeTrue()
            ->and($response->json('user.display_name'))->toBe('Pegawai Satu')
            ->and($response->json('user.email'))->toBe('p*****i@example.com')
            ->and($response->json('user.subject_id'))->toBe('pegawai-1');
        expect($response->headers->get('Cache-Control'))->toContain('no-store');
    });

    it('returns only the current session account when no device cookie is present', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');
        app(SsoSessionService::class)->createForUser($this->normal, '127.0.0.1', 'Mozilla/5.0');
        $cookieName = app(SsoSessionCookieFactory::class)->name();

        $response = $this->withHeader('Cookie', $cookieName.'='.$session->session_id)
            ->withHeaders(['User-Agent' => 'Mozilla/5.0'])
            ->getJson('/widget/accounts');

        $response->assertStatus(200);
        expect($response->json('accounts'))->toBeArray()
            ->and(count($response->json('accounts')))->toBe(1)
            ->and($response->json('accounts.0.display_name'))->toBe('Pegawai Satu')
            ->and($response->json('accounts.0.email'))->toBe('p*****i@example.com')
            ->and($response->json('accounts.0.status'))->toBe('active')
            ->and($response->json('accounts.0.is_current'))->toBeTrue()
            ->and($response->json('accounts.0.account_id'))->toBeNull()
            ->and(collect($response->json('accounts'))->pluck('display_name')->all())->not->toContain('Normal User');
    });

    it('lists only accounts bound to the current device cookie', function (): void {
        $registry = app(DeviceSessionRegistry::class);
        $sessionA = app(SsoSessionService::class)->createForUser($this->pegawai, '10.0.0.1', 'SharedBrowser');
        $sessionB = app(SsoSessionService::class)->createForUser($this->normal, '10.0.0.1', 'SharedBrowser');
        $otherSession = app(SsoSessionService::class)->createForUser(
            User::factory()->create([
                'subject_id' => 'other-1',
                'subject_uuid' => 'other-1',
                'email' => 'other@example.com',
                'role' => 'user',
                'display_name' => 'Other User',
            ]),
            '10.0.0.1',
            'SharedBrowser',
        );
        $deviceRequest = Request::create('/');
        $deviceRequest->cookies->set($registry->cookieName(), str_repeat('A', 48));
        $registry->bind($deviceRequest, $sessionA);
        $registry->bind($deviceRequest, $sessionB);

        $cookieName = app(SsoSessionCookieFactory::class)->name();
        $response = withWidgetCookies($this, $sessionA->session_id, str_repeat('A', 48))
            ->getJson('/widget/accounts');

        $response->assertStatus(200);
        expect(collect($response->json('accounts'))->pluck('display_name')->all())
            ->toBe(['Pegawai Satu', 'Normal User'])
            ->not->toContain('Other User');
        expect($response->json('accounts.0.is_current'))->toBeTrue()
            ->and($response->json('accounts.0.account_id'))->toBeString()
            ->and($response->json('accounts.1.account_id'))->toBeString();
        expect(json_encode($response->json('accounts')))
            ->not->toContain($sessionA->session_id)
            ->not->toContain($sessionB->session_id)
            ->not->toContain($otherSession->session_id);
    });

    it('does not list device accounts unless the current session is bound to that device', function (): void {
        $registry = app(DeviceSessionRegistry::class);
        $sessionA = app(SsoSessionService::class)->createForUser($this->pegawai, '10.0.0.1', 'SharedBrowser');
        $sessionB = app(SsoSessionService::class)->createForUser($this->normal, '10.0.0.1', 'SharedBrowser');
        $attacker = User::factory()->create([
            'subject_id' => 'attacker-1',
            'subject_uuid' => 'attacker-1',
            'email' => 'attacker@example.com',
            'role' => 'user',
            'display_name' => 'Attacker Session',
        ]);
        $attackerSession = app(SsoSessionService::class)->createForUser($attacker, '10.0.0.2', 'OtherBrowser');
        $deviceRequest = Request::create('/');
        $deviceRequest->cookies->set($registry->cookieName(), str_repeat('E', 48));
        $registry->bind($deviceRequest, $sessionA);
        $registry->bind($deviceRequest, $sessionB);

        $response = withWidgetCookies($this, $attackerSession->session_id, str_repeat('E', 48))
            ->getJson('/widget/accounts');

        $response->assertStatus(200);
        expect(collect($response->json('accounts'))->pluck('display_name')->all())
            ->toBe(['Attacker Session'])
            ->not->toContain('Pegawai Satu')
            ->not->toContain('Normal User');
        expect($response->json('accounts.0.account_id'))->toBeNull();
    });

    it('keeps device account links stable across app key rotation when a widget hash key is configured', function (): void {
        config()->set('sso.widget.device_hash_key', 'stable-widget-device-key');
        $registry = app(DeviceSessionRegistry::class);
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');
        $deviceRequest = Request::create('/');
        $deviceRequest->cookies->set($registry->cookieName(), str_repeat('F', 48));
        $cookie = $registry->bind($deviceRequest, $session);
        config()->set('app.key', 'base64:'.base64_encode(str_repeat('K', 32)));

        expect(strtolower((string) $cookie->getSameSite()))->toBe('none');

        $response = withWidgetCookies($this, $session->session_id, str_repeat('F', 48))
            ->getJson('/widget/accounts');

        $response->assertStatus(200);
        expect($response->json('accounts.0.display_name'))->toBe('Pegawai Satu')
            ->and($response->json('accounts.0.account_id'))->toBeString();
    });

    it('keeps login available when the widget device hash key is missing', function (): void {
        config()->set('sso.widget.device_hash_key', null);

        $response = $this->withHeaders([
            'Origin' => 'https://portal.example.test',
            'X-Requested-With' => 'XMLHttpRequest',
        ])->postJson('/api/auth/login', [
            'identifier' => 'pegawai@example.com',
            'password' => 'SecurePass123!',
        ]);

        $response->assertOk()
            ->assertJsonPath('authenticated', true);
        expect(DB::table('device_sessions')->count())->toBe(0);
    });

    it('falls back to the current account and fails switch safely when the widget hash key is missing', function (): void {
        $registry = app(DeviceSessionRegistry::class);
        $sessionA = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'SharedBrowser');
        $sessionB = app(SsoSessionService::class)->createForUser($this->normal, '127.0.0.1', 'SharedBrowser');
        $deviceRequest = Request::create('/');
        $deviceRequest->cookies->set($registry->cookieName(), str_repeat('J', 48));
        $registry->bind($deviceRequest, $sessionA);
        $registry->bind($deviceRequest, $sessionB);
        $accountId = DB::table('device_sessions')->where('session_id', $sessionB->session_id)->value('account_id');

        config()->set('sso.widget.device_hash_key', null);

        withWidgetCookies($this, $sessionA->session_id, str_repeat('J', 48))
            ->getJson('/widget/accounts')
            ->assertOk()
            ->assertJsonCount(1, 'accounts')
            ->assertJsonPath('accounts.0.display_name', 'Pegawai Satu')
            ->assertJsonPath('accounts.0.account_id', null);

        withWidgetCookies($this, $sessionA->session_id, str_repeat('J', 48))
            ->withHeaders([
                'Origin' => 'https://publik.test',
                'X-SSO-Widget-Action' => 'switch',
            ])
            ->postJson('/widget/switch', ['account_id' => $accountId])
            ->assertStatus(409)
            ->assertJson(['success' => false, 'error' => 'session_expired']);
    });

    it('rejects widget accounts without a valid session', function (): void {
        $this->getJson('/widget/accounts')
            ->assertStatus(401)
            ->assertJson(['accounts' => []]);
    });

    it('returns entitled apps for pegawai user (both apps)', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');
        $cookieName = app(SsoSessionCookieFactory::class)->name();

        $response = $this->withHeader('Cookie', $cookieName.'='.$session->session_id)
            ->getJson('/widget/apps');

        $response->assertStatus(200);
        $apps = collect($response->json('apps'));
        expect($apps->pluck('client_id')->all())->toContain('publik-app', 'kepegawaian-app');
    });

    it('does not emit non-web app launcher urls', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->normal, '127.0.0.1', 'Mozilla/5.0');
        $cookieName = app(SsoSessionCookieFactory::class)->name();

        $response = $this->withHeader('Cookie', $cookieName.'='.$session->session_id)
            ->getJson('/widget/apps');

        $response->assertStatus(200);
        $unsafe = collect($response->json('apps'))->firstWhere('client_id', 'unsafe-app');
        expect($unsafe['app_base_url'])->toBe('');
    });

    it('returns entitled apps for normal user (only publik app)', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->normal, '127.0.0.1', 'Mozilla/5.0');
        $cookieName = app(SsoSessionCookieFactory::class)->name();

        $response = $this->withHeader('Cookie', $cookieName.'='.$session->session_id)
            ->getJson('/widget/apps');

        $response->assertStatus(200);
        $apps = collect($response->json('apps'));
        expect($apps->pluck('client_id')->all())->toContain('publik-app')
            ->and($apps->pluck('client_id')->all())->not->toContain('kepegawaian-app');
    });

    it('logs out and revokes session', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');
        $registry = app(DeviceSessionRegistry::class);
        $deviceRequest = Request::create('/');
        $deviceRequest->cookies->set($registry->cookieName(), str_repeat('B', 48));
        $registry->bind($deviceRequest, $session);
        $cookieName = app(SsoSessionCookieFactory::class)->name();

        $response = withWidgetCookies($this, $session->session_id, str_repeat('B', 48))
            ->withHeaders([
                'Origin' => 'https://publik.test',
                'X-SSO-Widget-Action' => 'logout',
            ])
            ->postJson('/widget/logout');

        $response->assertStatus(200);
        $response->assertJson(['success' => true]);
        $response->assertCookieExpired($cookieName);

        // Assert database state is revoked
        $dbSession = SsoSession::query()->where('session_id', $session->session_id)->first();
        expect($dbSession->revoked_at)->not->toBeNull();
        expect(DB::table('device_sessions')->where('session_id', $session->session_id)->exists())->toBeFalse();
    });

    it('switches only to an active session bound to the current device', function (): void {
        $registry = app(DeviceSessionRegistry::class);
        $sessionA = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');
        $sessionB = app(SsoSessionService::class)->createForUser($this->normal, '127.0.0.1', 'Mozilla/5.0');
        $deviceRequest = Request::create('/');
        $deviceRequest->cookies->set($registry->cookieName(), str_repeat('C', 48));
        $registry->bind($deviceRequest, $sessionA);
        $registry->bind($deviceRequest, $sessionB);
        $accountId = DB::table('device_sessions')->where('session_id', $sessionB->session_id)->value('account_id');

        $response = withWidgetCookies($this, $sessionA->session_id, str_repeat('C', 48))
            ->withHeaders([
                'Origin' => 'https://publik.test',
                'X-SSO-Widget-Action' => 'switch',
            ])
            ->postJson('/widget/switch', ['account_id' => $accountId]);

        $response->assertStatus(200)->assertJson(['success' => true]);
        $response->assertCookie(app(SsoSessionCookieFactory::class)->name());
    });

    it('rejects switching from a stolen device cookie without a current device-bound session', function (): void {
        $registry = app(DeviceSessionRegistry::class);
        $sessionA = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');
        $sessionB = app(SsoSessionService::class)->createForUser($this->normal, '127.0.0.1', 'Mozilla/5.0');
        $attacker = User::factory()->create([
            'subject_id' => 'attacker-switch',
            'subject_uuid' => 'attacker-switch',
            'email' => 'attacker-switch@example.com',
            'role' => 'user',
            'display_name' => 'Attacker Switch',
        ]);
        $attackerSession = app(SsoSessionService::class)->createForUser($attacker, '127.0.0.2', 'OtherBrowser');
        $deviceRequest = Request::create('/');
        $deviceRequest->cookies->set($registry->cookieName(), str_repeat('G', 48));
        $registry->bind($deviceRequest, $sessionA);
        $registry->bind($deviceRequest, $sessionB);
        $accountId = DB::table('device_sessions')->where('session_id', $sessionB->session_id)->value('account_id');

        $response = withWidgetCookies($this, $attackerSession->session_id, str_repeat('G', 48))
            ->withHeaders([
                'Origin' => 'https://publik.test',
                'X-SSO-Widget-Action' => 'switch',
            ])
            ->postJson('/widget/switch', ['account_id' => $accountId]);

        $response->assertStatus(409)
            ->assertJson(['success' => false, 'error' => 'session_expired']);
        $response->assertCookieMissing(app(SsoSessionCookieFactory::class)->name());
    });

    it('removes device account links when a session is revoked through the session service', function (): void {
        $registry = app(DeviceSessionRegistry::class);
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');
        $deviceRequest = Request::create('/');
        $deviceRequest->cookies->set($registry->cookieName(), str_repeat('H', 48));
        $registry->bind($deviceRequest, $session);

        app(SsoSessionService::class)->revoke($session);

        expect(DB::table('device_sessions')->where('session_id', $session->session_id)->exists())->toBeFalse();
    });

    it('prunes expired device account links', function (): void {
        $registry = app(DeviceSessionRegistry::class);
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');
        $deviceRequest = Request::create('/');
        $deviceRequest->cookies->set($registry->cookieName(), str_repeat('I', 48));
        $registry->bind($deviceRequest, $session);
        $session->forceFill(['expires_at' => now()->subMinute()])->save();

        $this->artisan('sso:prune-device-sessions')->assertSuccessful();

        expect(DB::table('device_sessions')->where('session_id', $session->session_id)->exists())->toBeFalse();
    });

    it('prunes expired device account links in chunks', function (): void {
        $userId = $this->pegawai->getKey();
        $now = now();
        $rows = [];

        for ($i = 0; $i < 1005; $i++) {
            $sessionId = 'expired-session-'.$i;
            SsoSession::query()->create([
                'session_id' => $sessionId,
                'user_id' => $userId,
                'subject_id' => $this->pegawai->subject_id,
                'ip_address' => '127.0.0.1',
                'user_agent' => 'PruneTest',
                'authenticated_at' => $now,
                'last_seen_at' => $now,
                'expires_at' => $now->copy()->subMinute(),
            ]);
            $rows[] = [
                'device_hash' => hash('sha256', 'chunk-device-'.$i),
                'session_id' => $sessionId,
                'user_id' => $userId,
                'account_id' => 'chunk-account-'.$i,
                'added_at' => $now,
                'last_seen_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        DB::table('device_sessions')->insert($rows);

        $this->artisan('sso:prune-device-sessions')
            ->assertSuccessful()
            ->expectsOutput('Pruned 1005 device session row(s).');

        expect(DB::table('device_sessions')->count())->toBe(0);
    });

    it('rejects switching to a session revoked by admin session management', function (): void {
        $registry = app(DeviceSessionRegistry::class);
        $sessionA = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');
        $sessionB = app(SsoSessionService::class)->createForUser($this->normal, '127.0.0.1', 'Mozilla/5.0');
        $deviceRequest = Request::create('/');
        $deviceRequest->cookies->set($registry->cookieName(), str_repeat('K', 48));
        $registry->bind($deviceRequest, $sessionA);
        $registry->bind($deviceRequest, $sessionB);
        $accountId = DB::table('device_sessions')->where('session_id', $sessionB->session_id)->value('account_id');
        app(SsoSessionService::class)->revoke($sessionB);

        withWidgetCookies($this, $sessionA->session_id, str_repeat('K', 48))
            ->withHeaders([
                'Origin' => 'https://publik.test',
                'X-SSO-Widget-Action' => 'switch',
            ])
            ->postJson('/widget/switch', ['account_id' => $accountId])
            ->assertStatus(409)
            ->assertJson(['success' => false, 'error' => 'session_expired']);
    });

    it('rejects widget switch requests without trusted mutation headers', function (): void {
        $registry = app(DeviceSessionRegistry::class);
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');
        $deviceRequest = Request::create('/');
        $deviceRequest->cookies->set($registry->cookieName(), str_repeat('D', 48));
        $registry->bind($deviceRequest, $session);
        $accountId = DB::table('device_sessions')->where('session_id', $session->session_id)->value('account_id');

        withWidgetCookies($this, $session->session_id, str_repeat('D', 48))
            ->withHeader('Origin', 'https://malicious-site.com')
            ->postJson('/widget/switch', ['account_id' => $accountId])
            ->assertStatus(403);
    });

    it('rejects cross-site simple widget logout posts', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');
        $cookieName = app(SsoSessionCookieFactory::class)->name();

        $response = $this->withHeader('Cookie', $cookieName.'='.$session->session_id)
            ->withHeader('Origin', 'https://malicious-site.com')
            ->postJson('/widget/logout');

        $response->assertStatus(403);
        $dbSession = SsoSession::query()->where('session_id', $session->session_id)->first();
        expect($dbSession->revoked_at)->toBeNull();
    });
});

describe('SSO Widget CORS Origin Validation', function (): void {
    it('allows CORS from a registered client origin', function (): void {
        $response = $this->withHeaders(['Origin' => 'https://publik.test'])
            ->getJson('/widget/session');

        $response->assertHeader('Access-Control-Allow-Origin', 'https://publik.test');
        $response->assertHeader('Access-Control-Allow-Credentials', 'true');
        $response->assertHeader('Vary', 'Origin');
    });

    it('denies credentialed CORS for same host on a different scheme or port', function (): void {
        $this->withHeaders(['Origin' => 'http://publik.test'])
            ->getJson('/widget/session')
            ->assertHeaderMissing('Access-Control-Allow-Origin');

        $this->withHeaders(['Origin' => 'https://publik.test:3000'])
            ->getJson('/widget/session')
            ->assertHeaderMissing('Access-Control-Allow-Origin');
    });

    it('denies CORS from an unregistered origin', function (): void {
        $response = $this->withHeaders(['Origin' => 'https://malicious-site.com'])
            ->getJson('/widget/session');

        $response->assertHeaderMissing('Access-Control-Allow-Origin');
        $response->assertHeaderMissing('Access-Control-Allow-Credentials');
        $response->assertHeader('Vary', 'Origin');
    });

    it('does not trust redirect uri origins for credentialed widget cors', function (): void {
        $response = $this->withHeaders(['Origin' => 'https://unsafe.test'])
            ->getJson('/widget/session');

        $response->assertHeaderMissing('Access-Control-Allow-Origin');
        $response->assertHeaderMissing('Access-Control-Allow-Credentials');
        $response->assertHeader('Vary', 'Origin');
    });

    it('flushes cached widget origins when client registrations change', function (): void {
        OidcClientRegistration::query()->create([
            'client_id' => 'dynamic-widget-client',
            'display_name' => 'Dynamic Widget Client',
            'type' => 'public',
            'environment' => 'development',
            'app_base_url' => 'https://dynamic-widget.test',
            'redirect_uris' => ['https://dynamic-widget.test/callback'],
            'post_logout_redirect_uris' => ['https://dynamic-widget.test/logout'],
            'allowed_scopes' => ['openid'],
            'owner_email' => 'owner@example.com',
            'provisioning' => 'jit',
            'status' => 'active',
            'category' => 'publik',
            'contract' => [],
        ]);

        $this->withHeaders(['Origin' => 'https://dynamic-widget.test'])
            ->getJson('/widget/session')
            ->assertHeader('Access-Control-Allow-Origin', 'https://dynamic-widget.test');

        OidcClientRegistration::query()
            ->where('client_id', 'dynamic-widget-client')
            ->firstOrFail()
            ->forceFill(['app_base_url' => 'https://dynamic-widget-new.test'])
            ->save();

        $this->withHeaders(['Origin' => 'https://dynamic-widget.test'])
            ->getJson('/widget/session')
            ->assertHeaderMissing('Access-Control-Allow-Origin');

        $this->withHeaders(['Origin' => 'https://dynamic-widget-new.test'])
            ->getJson('/widget/session')
            ->assertHeader('Access-Control-Allow-Origin', 'https://dynamic-widget-new.test');
    });
});

describe('Browser Mutation Origin Guard', function (): void {
    it('rejects portal auth logout when origin and referer are absent', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');

        $this->withHeader('Cookie', app(SsoSessionCookieFactory::class)->name().'='.$session->session_id)
            ->withHeader('X-Requested-With', 'XMLHttpRequest')
            ->post('/api/auth/logout')
            ->assertStatus(403);

        expect(SsoSession::query()->where('session_id', $session->session_id)->whereNull('revoked_at')->exists())
            ->toBeTrue();
    });

    it('rejects cross-site portal auth logout when browser mutation headers are missing', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');

        $this->withHeader('Cookie', app(SsoSessionCookieFactory::class)->name().'='.$session->session_id)
            ->withHeader('Origin', 'https://malicious-site.com')
            ->post('/api/auth/logout')
            ->assertStatus(403);

        expect(SsoSession::query()->where('session_id', $session->session_id)->whereNull('revoked_at')->exists())
            ->toBeTrue();
    });

    it('rejects cross-site profile session revocation when browser mutation headers are missing', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');

        $this->withHeader('Cookie', app(SsoSessionCookieFactory::class)->name().'='.$session->session_id)
            ->withHeader('Origin', 'https://malicious-site.com')
            ->delete('/api/profile/sessions/'.$session->session_id)
            ->assertStatus(403);

        expect(SsoSession::query()->where('session_id', $session->session_id)->whereNull('revoked_at')->exists())
            ->toBeTrue();
    });

    it('rejects profile email changes when origin and referer are absent', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');

        $this->withHeader('Cookie', app(SsoSessionCookieFactory::class)->name().'='.$session->session_id)
            ->withHeader('X-Requested-With', 'XMLHttpRequest')
            ->post('/api/profile/email-change', [
                'new_email' => 'new-pegawai@example.com',
                'current_password' => 'SecurePass123!',
            ])
            ->assertStatus(403);
    });

    it('rejects cross-site profile email changes when browser mutation headers are missing', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');

        $this->withHeader('Cookie', app(SsoSessionCookieFactory::class)->name().'='.$session->session_id)
            ->withHeader('Origin', 'https://malicious-site.com')
            ->post('/api/profile/email-change', [
                'new_email' => 'new-pegawai@example.com',
                'current_password' => 'SecurePass123!',
            ])
            ->assertStatus(403);
    });

    it('rejects mfa removal when origin and referer are absent', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');

        $this->withHeader('Cookie', app(SsoSessionCookieFactory::class)->name().'='.$session->session_id)
            ->withHeader('X-Requested-With', 'XMLHttpRequest')
            ->delete('/api/mfa/totp', ['password' => 'SecurePass123!'])
            ->assertStatus(403);
    });

    it('rejects cross-site mfa removal when browser mutation headers are missing', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');

        $this->withHeader('Cookie', app(SsoSessionCookieFactory::class)->name().'='.$session->session_id)
            ->withHeader('Origin', 'https://malicious-site.com')
            ->delete('/api/mfa/totp', ['password' => 'SecurePass123!'])
            ->assertStatus(403);
    });

    it('rejects trusted portal mutations when the xhr header is absent', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');

        $this->withHeader('Cookie', app(SsoSessionCookieFactory::class)->name().'='.$session->session_id)
            ->withHeader('Origin', 'https://portal.example.test')
            ->post('/api/auth/logout')
            ->assertStatus(403);

        expect(SsoSession::query()->where('session_id', $session->session_id)->whereNull('revoked_at')->exists())
            ->toBeTrue();
    });

    it('allows trusted portal mutations when the xhr header is present', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');

        $this->withHeader('Cookie', app(SsoSessionCookieFactory::class)->name().'='.$session->session_id)
            ->withHeaders([
                'Origin' => 'https://portal.example.test',
                'X-Requested-With' => 'XMLHttpRequest',
            ])
            ->postJson('/api/auth/logout')
            ->assertOk();
    });

    it('allows trusted referer fallback when the origin header is absent', function (): void {
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');

        $this->withHeader('Cookie', app(SsoSessionCookieFactory::class)->name().'='.$session->session_id)
            ->withHeaders([
                'Referer' => 'https://portal.example.test/profile/security',
                'X-Requested-With' => 'XMLHttpRequest',
            ])
            ->postJson('/api/auth/logout')
            ->assertOk();
    });

    it('allows configured first-party browser mutation origins', function (): void {
        config()->set('sso.browser_mutation.trusted_origins', ['https://admin.example.test']);
        $session = app(SsoSessionService::class)->createForUser($this->pegawai, '127.0.0.1', 'Mozilla/5.0');

        $this->withHeader('Cookie', app(SsoSessionCookieFactory::class)->name().'='.$session->session_id)
            ->withHeaders([
                'Origin' => 'https://admin.example.test',
                'X-Requested-With' => 'XMLHttpRequest',
            ])
            ->postJson('/api/auth/logout')
            ->assertOk();
    });
});

function withWidgetCookies(mixed $test, string $sessionId, string $deviceId): mixed
{
    $deviceName = app(DeviceSessionRegistry::class)->cookieName();
    $encryptedDevice = encrypt(
        CookieValuePrefix::create($deviceName, app('encrypter')->getKey()).$deviceId,
        false,
    );

    return $test
        ->withCredentials()
        ->withUnencryptedCookie(app(SsoSessionCookieFactory::class)->name(), $sessionId)
        ->withUnencryptedCookie($deviceName, $encryptedDevice);
}
