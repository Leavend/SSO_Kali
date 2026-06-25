<?php

declare(strict_types=1);

use App\Models\OidcClientEntitlement;
use App\Models\OidcClientRegistration;
use App\Models\User;
use App\Services\Admin\AdminClientPresenter;
use App\Services\Admin\AdminUserPresenter;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\SigningKeyService;
use App\Services\Oidc\UserClaimsFactory;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Hash;

beforeEach(function (): void {
    config()->set('oidc_clients.clients', [
        'publik-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://publik.test/callback'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'staff_identity'],
            'skip_consent' => true,
            'category' => 'publik',
        ],
        'kepegawaian-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://kepegawaian.test/callback'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'staff_identity'],
            'skip_consent' => true,
            'category' => 'kepegawaian',
        ],
    ]);

    app(DownstreamClientRegistry::class)->flush();

    // Create Pegawai user
    $pegawai = User::factory()->create([
        'subject_id' => 'pegawai-user-1',
        'subject_uuid' => 'pegawai-user-1',
        'email' => 'pegawai@example.com',
        'password' => Hash::make('SecurePass123!'),
        'password_changed_at' => now(),
        'role' => 'pegawai',
        'nik' => '1234567890123456',
        'nip' => '199001012015011001',
        'nisn' => '0012345678',
        'birth_date' => '1990-01-01',
    ]);
    OidcClientEntitlement::grant('kepegawaian-app', $pegawai, 'test');

    // Create Normal user
    User::factory()->create([
        'subject_id' => 'normal-user-1',
        'subject_uuid' => 'normal-user-1',
        'email' => 'normal@example.com',
        'password' => Hash::make('SecurePass123!'),
        'password_changed_at' => now(),
        'role' => 'user',
        'nik' => '9876543210987654',
        'nip' => '199505052020052002',
        'nisn' => '0054321098',
        'birth_date' => '1995-05-05',
    ]);
});

describe('Multi-identifier Resolution & Login Timing-safety', function (): void {
    it('allows logging in via email + password', function (): void {
        $response = $this->postJson('/connect/local-login', [
            'email' => 'pegawai@example.com',
            'password' => 'SecurePass123!',
            'client_id' => 'publik-app',
            'redirect_uri' => 'https://publik.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'random-state-123',
            'nonce' => 'nonce-abc',
            'scope' => 'openid profile email',
        ]);

        $response->assertOk();
        expect($response->json('redirect_uri'))->toContain('code=');
    });

    it('allows logging in via NIP + password', function (): void {
        $response = $this->postJson('/connect/local-login', [
            'email' => '199001012015011001',
            'password' => 'SecurePass123!',
            'client_id' => 'publik-app',
            'redirect_uri' => 'https://publik.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'random-state-123',
            'nonce' => 'nonce-abc',
            'scope' => 'openid profile email',
        ]);

        $response->assertOk();
        expect($response->json('redirect_uri'))->toContain('code=');
    });

    it('allows logging in via NISN + password', function (): void {
        $response = $this->postJson('/connect/local-login', [
            'email' => '0012345678',
            'password' => 'SecurePass123!',
            'client_id' => 'publik-app',
            'redirect_uri' => 'https://publik.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'random-state-123',
            'nonce' => 'nonce-abc',
            'scope' => 'openid profile email',
        ]);

        $response->assertOk();
        expect($response->json('redirect_uri'))->toContain('code=');
    });

    it('allows logging in via NIK + password', function (): void {
        $response = $this->postJson('/connect/local-login', [
            'email' => '1234567890123456',
            'password' => 'SecurePass123!',
            'client_id' => 'publik-app',
            'redirect_uri' => 'https://publik.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'random-state-123',
            'nonce' => 'nonce-abc',
            'scope' => 'openid profile email',
        ]);

        $response->assertOk();
        expect($response->json('redirect_uri'))->toContain('code=');
    });

    it('allows logging in via canonicalized NIK + password', function (): void {
        $response = $this->postJson('/connect/local-login', [
            'email' => '1234 5678 9012 3456',
            'password' => 'SecurePass123!',
            'client_id' => 'publik-app',
            'redirect_uri' => 'https://publik.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'random-state-123',
            'nonce' => 'nonce-abc',
            'scope' => 'openid profile email',
        ]);

        $response->assertOk();
        expect($response->json('redirect_uri'))->toContain('code=');
    });

    it('rejects logging in using NIK as the password', function (): void {
        $response = $this->postJson('/connect/local-login', [
            'email' => '1234567890123456',
            'password' => '1234567890123456',
            'client_id' => 'publik-app',
            'redirect_uri' => 'https://publik.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'random-state-123',
            'nonce' => 'nonce-abc',
            'scope' => 'openid profile email',
        ]);

        $response->assertStatus(401);
        expect($response->json('error'))->toBe('invalid_credentials');
    });

    it('fails NIK login safely when the production hash key is missing', function (): void {
        $this->withoutMiddleware();
        $this->app->detectEnvironment(static fn (): string => 'production');
        config()->set('sso.identity.nik_hash_key', '');

        try {
            $response = $this->postJson('/connect/local-login', [
                'email' => '1234567890123456',
                'password' => 'SecurePass123!',
                'client_id' => 'publik-app',
                'redirect_uri' => 'https://publik.test/callback',
                'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
                'code_challenge_method' => 'S256',
                'state' => 'random-state-123',
                'nonce' => 'nonce-abc',
                'scope' => 'openid profile email',
            ]);
        } finally {
            $this->app->detectEnvironment(static fn (): string => 'testing');
        }

        $response->assertStatus(401);
        expect($response->json('error'))->toBe('invalid_credentials');
    });
});

describe('Entitlement Enforcement Gating', function (): void {
    it('allows admin users to access kepegawaian app', function (): void {
        $admin = User::factory()->create([
            'subject_id' => 'admin-user-1',
            'subject_uuid' => 'admin-user-1',
            'email' => 'admin@example.com',
            'password' => Hash::make('SecurePass123!'),
            'password_changed_at' => now(),
            'role' => 'admin',
        ]);
        OidcClientEntitlement::grant('kepegawaian-app', $admin, 'test');

        $response = $this->postJson('/connect/local-login', [
            'email' => 'admin@example.com',
            'password' => 'SecurePass123!',
            'client_id' => 'kepegawaian-app',
            'redirect_uri' => 'https://kepegawaian.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'random-state-123',
            'nonce' => 'nonce-abc',
            'scope' => 'openid profile email',
        ]);

        $response->assertOk();
    });

    it('allows pegawai users to access kepegawaian app', function (): void {
        $response = $this->postJson('/connect/local-login', [
            'email' => 'pegawai@example.com',
            'password' => 'SecurePass123!',
            'client_id' => 'kepegawaian-app',
            'redirect_uri' => 'https://kepegawaian.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'random-state-123',
            'nonce' => 'nonce-abc',
            'scope' => 'openid profile email',
        ]);

        $response->assertOk();
    });

    it('denies normal users from accessing kepegawaian app', function (): void {
        $response = $this->postJson('/connect/local-login', [
            'email' => 'normal@example.com',
            'password' => 'SecurePass123!',
            'client_id' => 'kepegawaian-app',
            'redirect_uri' => 'https://kepegawaian.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'random-state-123',
            'nonce' => 'nonce-abc',
            'scope' => 'openid profile email',
        ]);

        $response->assertStatus(403);
        expect($response->json('error'))->toBe('access_denied');
    });

    it('denies access when a client category is unknown', function (): void {
        config()->set('oidc_clients.clients.unknown-category-app', [
            'type' => 'public',
            'redirect_uris' => ['https://unknown.test/callback'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => true,
            'category' => 'kepegawaiann',
        ]);
        app(DownstreamClientRegistry::class)->flush();

        $response = $this->postJson('/connect/local-login', [
            'email' => 'pegawai@example.com',
            'password' => 'SecurePass123!',
            'client_id' => 'unknown-category-app',
            'redirect_uri' => 'https://unknown.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'random-state-123',
            'nonce' => 'nonce-abc',
            'scope' => 'openid profile email',
        ]);

        $response->assertStatus(403);
        expect($response->json('error'))->toBe('access_denied');
    });
});

describe('staff_identity Scope and Claims', function (): void {
    it('issues non-reconstructable staff identity claims when staff_identity scope is requested', function (): void {
        $response = $this->postJson('/connect/local-login', [
            'email' => 'pegawai@example.com',
            'password' => 'SecurePass123!',
            'client_id' => 'publik-app',
            'redirect_uri' => 'https://publik.test/callback',
            'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            'code_challenge_method' => 'S256',
            'state' => 'random-state-123',
            'nonce' => 'nonce-abc',
            'scope' => 'openid profile email staff_identity',
        ]);

        $response->assertOk();
        parse_str((string) parse_url((string) $response->json('redirect_uri'), PHP_URL_QUERY), $callback);

        $tokenResponse = $this->postJson('/token', [
            'grant_type' => 'authorization_code',
            'client_id' => 'publik-app',
            'redirect_uri' => 'https://publik.test/callback',
            'code' => (string) $callback['code'],
            'code_verifier' => 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
        ]);

        $tokenResponse->assertOk();
        $claims = app(SigningKeyService::class)->decode((string) $tokenResponse->json('id_token'));

        expect($claims['nik'])->not->toBe('1234567890123456')
            ->and($claims['nik'])->not->toStartWith('REF-')
            ->and($claims['nik'])->toBe('12****56')
            ->and($claims['nip'])->not->toBe('199001012015011001')
            ->and($claims['nip'])->not->toStartWith('REF-')
            ->and($claims['nip'])->toBe('19****01')
            ->and($claims['nisn'])->not->toBe('0012345678')
            ->and($claims['nisn'])->not->toStartWith('REF-')
            ->and($claims['nisn'])->toBe('00****78')
            ->and($claims['birth_date'])->toBe('YEAR-1990')
            ->and($claims['birth_date'])->not->toContain('01-01');
    });
});

describe('Presenters masking and data inclusion', function (): void {
    it('masks staff identifiers in AdminUserPresenter', function (): void {
        $user = User::query()->where('email', 'pegawai@example.com')->firstOrFail();
        $presenter = app(AdminUserPresenter::class);
        $presented = $presenter->user($user);

        expect($presented['nik'])->toBe('12****56')
            ->and($presented['birth_date'])->toBe('YEAR-1990')
            ->and($presented['nip'])->toBe('19****01')
            ->and($presented['nisn'])->toBe('00****78');
    });

    it('stores government identifiers encrypted with hash columns for lookup', function (): void {
        $user = User::query()->where('email', 'pegawai@example.com')->firstOrFail();

        expect($user->getRawOriginal('nik'))->not->toBe('1234567890123456')
            ->and($user->getRawOriginal('nip'))->not->toBe('199001012015011001')
            ->and($user->getRawOriginal('nisn'))->not->toBe('0012345678')
            ->and($user->nik_hash)->toBeString()
            ->and($user->nip_hash)->toBeString()
            ->and($user->nisn_hash)->toBeString()
            ->and($user->nik_hash)->not->toBe($user->nip_hash)
            ->and($user->nip_hash)->not->toBe($user->nisn_hash);
    });

    it('hides government identifiers and hash columns during direct model serialization', function (): void {
        $user = User::query()->where('email', 'pegawai@example.com')->firstOrFail();

        $serialized = $user->toArray();
        $json = $user->toJson();

        expect($serialized)->not->toHaveKeys([
            'nik',
            'nik_hash',
            'nip',
            'nip_hash',
            'nisn',
            'nisn_hash',
            'birth_date',
        ])
            ->and($json)->not->toContain('1234567890123456')
            ->and($json)->not->toContain('199001012015011001')
            ->and($json)->not->toContain('0012345678')
            ->and($json)->not->toContain((string) $user->nik_hash);
    });

    it('keeps admin and claims presentation resilient when encrypted identifiers cannot be decrypted', function (): void {
        $user = User::query()->where('email', 'pegawai@example.com')->firstOrFail();
        $user->setRawAttributes([
            ...$user->getAttributes(),
            'nik' => 'not-valid-ciphertext',
            'nip' => 'not-valid-ciphertext',
            'nisn' => 'not-valid-ciphertext',
        ], true);

        $presented = app(AdminUserPresenter::class)->user($user);
        $claims = app(UserClaimsFactory::class)->idTokenClaims($user, [
            'client_id' => 'publik-app',
            'session_id' => 'sess-corrupt-identifiers',
            'scope' => 'openid staff_identity',
        ], 'jti-corrupt-identifiers');

        expect($presented['nik'])->toBe('****')
            ->and($presented['nip'])->toBe('****')
            ->and($presented['nisn'])->toBe('****')
            ->and($claims['nik'])->toBe('****')
            ->and($claims['nip'])->toBe('****')
            ->and($claims['nisn'])->toBe('****');
    });

    it('normalizes malformed government identifiers to null on model saves', function (): void {
        $user = User::factory()->create([
            'email' => 'malformed-identifiers@example.com',
            'nik' => '1234-invalid',
            'nip' => 'abc',
            'nisn' => '123',
        ]);

        expect($user->nik)->toBeNull()
            ->and($user->nik_hash)->toBeNull()
            ->and($user->nip)->toBeNull()
            ->and($user->nip_hash)->toBeNull()
            ->and($user->nisn)->toBeNull()
            ->and($user->nisn_hash)->toBeNull();
    });

    it('rejects duplicate government identifiers at database level', function (): void {
        expect(fn () => User::factory()->create([
            'email' => 'duplicate-nip@example.com',
            'nip' => '199001012015011001',
        ]))->toThrow(QueryException::class);
    });

    it('presents client category in AdminClientPresenter', function (): void {
        $registration = OidcClientRegistration::query()->create([
            'client_id' => 'dynamic-test',
            'display_name' => 'Dynamic Test App',
            'type' => 'public',
            'environment' => 'development',
            'app_base_url' => 'https://dynamic.test',
            'redirect_uris' => ['https://dynamic.test/callback'],
            'post_logout_redirect_uris' => ['https://dynamic.test/'],
            'allowed_scopes' => ['openid'],
            'owner_email' => 'owner@example.com',
            'provisioning' => 'jit',
            'status' => 'active',
            'category' => 'kepegawaian',
            'contract' => [],
        ]);

        $presenter = app(AdminClientPresenter::class);
        $presented = $presenter->registration($registration);

        expect($presented['category'])->toBe('kepegawaian');
    });

    it('fails the production identity hash key guard when SSO_NIK_HASH_KEY is missing', function (): void {
        $this->app->detectEnvironment(static fn (): string => 'production');
        config()->set('sso.identity.nik_hash_key', '');

        try {
            $this->artisan('sso:check-identity-hash-key')
                ->expectsOutputToContain('SSO_NIK_HASH_KEY must be configured')
                ->assertExitCode(1);
        } finally {
            $this->app->detectEnvironment(static fn (): string => 'testing');
        }
    });

    it('passes the production identity hash key guard when SSO_NIK_HASH_KEY is configured', function (): void {
        $this->app->detectEnvironment(static fn (): string => 'production');
        config()->set('sso.identity.nik_hash_key', 'configured-production-identity-hash-key');

        try {
            $this->artisan('sso:check-identity-hash-key')
                ->expectsOutputToContain('Government identifier hash key is configured.')
                ->assertExitCode(0);
        } finally {
            $this->app->detectEnvironment(static fn (): string => 'testing');
        }
    });

    it('refuses to rollback identity expansion when stored identity data exists', function (): void {
        $migration = include database_path('migrations/2026_06_23_000000_sso_identity_expansion.php');

        expect(fn () => $migration->down())
            ->toThrow(RuntimeException::class, 'Refusing to rollback sso_identity_expansion');
    });
});
