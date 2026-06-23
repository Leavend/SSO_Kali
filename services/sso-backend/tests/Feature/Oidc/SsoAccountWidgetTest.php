<?php

declare(strict_types=1);

use App\Models\OidcClientRegistration;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\WidgetOriginPolicy;
use App\Services\Session\SsoSessionCookieFactory;
use App\Services\Session\SsoSessionService;
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
            ->toContain('sso-widget-container')
            ->toContain('const SSO_BACKEND_URL = "https://sso.example.test"')
            ->toContain("SSO_BACKEND_URL + '/widget/session'");
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
    });

    it('returns only the current session account with status', function (): void {
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
            ->and(collect($response->json('accounts'))->pluck('display_name')->all())->not->toContain('Normal User');
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
        $cookieName = app(SsoSessionCookieFactory::class)->name();

        $response = $this->withHeader('Cookie', $cookieName.'='.$session->session_id)
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
