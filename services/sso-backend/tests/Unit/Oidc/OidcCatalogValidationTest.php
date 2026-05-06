<?php

declare(strict_types=1);

use App\Exceptions\InvalidOidcConfigurationException;
use App\Services\Oidc\PrototypeOidcCatalog;
use Tests\TestCase;

beforeEach(function (): void {
    TestCase::setUp();
});

afterEach(function (): void {
    TestCase::tearDown();
});

it('validates configuration successfully when all required fields are present', function (): void {
    $catalog = new PrototypeOidcCatalog(app('App\Services\Oidc\SigningKeyService'));

    expect($catalog->discovery())
        ->toBeArray()
        ->and($catalog->discovery()['issuer'])
        ->toBe(config('sso.issuer'));
});

it('throws exception when issuer is missing', function (): void {
    config(['sso.issuer' => '']);

    $catalog = new PrototypeOidcCatalog(app('App\Services\Oidc\SigningKeyService'));

    $catalog->discovery();
})->throws(InvalidOidcConfigurationException::class, 'OIDC configuration is missing required key: sso.issuer');

it('throws exception when issuer is not a valid URL', function (): void {
    config(['sso.issuer' => 'not-a-valid-url']);

    $catalog = new PrototypeOidcCatalog(app('App\Services\Oidc\SigningKeyService'));

    $catalog->discovery();
})->throws(InvalidOidcConfigurationException::class, 'OIDC configuration has invalid value for \'sso.issuer\'');

it('throws exception when base_url is missing', function (): void {
    config(['sso.base_url' => '']);

    $catalog = new PrototypeOidcCatalog(app('App\Services\Oidc\SigningKeyService'));

    $catalog->discovery();
})->throws(InvalidOidcConfigurationException::class, 'OIDC configuration is missing required key: sso.base_url');

it('throws exception when base_url is not a valid URL', function (): void {
    config(['sso.base_url' => 'not-a-valid-url']);

    $catalog = new PrototypeOidcCatalog(app('App\Services\Oidc\SigningKeyService'));

    $catalog->discovery();
})->throws(InvalidOidcConfigurationException::class, 'OIDC configuration has invalid value for \'sso.base_url\'');

it('throws exception when signing_alg is missing', function (): void {
    config(['sso.signing.alg' => '']);

    $catalog = new PrototypeOidcCatalog(app('App\Services\Oidc\SigningKeyService'));

    $catalog->discovery();
})->throws(InvalidOidcConfigurationException::class, 'OIDC configuration is missing required key: sso.signing.alg');

it('throws exception when default_scopes is missing', function (): void {
    config(['sso.default_scopes' => []]);

    $catalog = new PrototypeOidcCatalog(app('App\Services\Oidc\SigningKeyService'));

    $catalog->discovery();
})->throws(InvalidOidcConfigurationException::class, 'OIDC configuration is missing required key: sso.default_scopes');

it('throws exception when signing keys cannot be loaded', function (): void {
    config(['sso.signing.private_key_path' => '/nonexistent/private.pem']);
    config(['sso.signing.public_key_path' => '/nonexistent/public.pem']);
    config(['app.env' => 'production']);

    $catalog = new PrototypeOidcCatalog(app('App\Services\Oidc\SigningKeyService'));

    $catalog->discovery();
})->throws(InvalidOidcConfigurationException::class, 'OIDC signing keys could not be loaded');

it('generates keys automatically in local environment when missing', function (): void {
    $tempDir = sys_get_temp_dir().'/sso_oidc_test_'.uniqid();

    config(['app.env' => 'local']);
    config(['sso.signing.private_key_path' => $tempDir.'/private.pem']);
    config(['sso.signing.public_key_path' => $tempDir.'/public.pem']);

    try {
        $catalog = new PrototypeOidcCatalog(app('App\Services\Oidc\SigningKeyService'));

        $result = $catalog->discovery();

        expect($result['id_token_signing_alg_values_supported'])
            ->toBeArray()
            ->toContain('ES256');

        expect(file_exists($tempDir.'/private.pem'))->toBeTrue();
        expect(file_exists($tempDir.'/public.pem'))->toBeTrue();
    } finally {
        if (file_exists($tempDir.'/private.pem')) {
            unlink($tempDir.'/private.pem');
        }
        if (file_exists($tempDir.'/public.pem')) {
            unlink($tempDir.'/public.pem');
        }
        if (is_dir($tempDir)) {
            rmdir($tempDir);
        }
    }
});

it('validates URL formats for issuer', function (): void {
    $validUrls = [
        'https://example.com',
        'https://sso.example.com/oauth',
        'http://localhost:8200',
    ];

    foreach ($validUrls as $url) {
        config(['sso.issuer' => $url]);

        $catalog = new PrototypeOidcCatalog(app('App\Services\Oidc\SigningKeyService'));

        expect($catalog->discovery()['issuer'])->toBe($url);
    }
});

it('validates URL formats for base_url', function (): void {
    $validUrls = [
        'https://example.com',
        'https://sso.example.com/oauth',
        'http://localhost:8200',
    ];

    foreach ($validUrls as $url) {
        config(['sso.base_url' => $url]);

        $catalog = new PrototypeOidcCatalog(app('App\Services\Oidc\SigningKeyService'));

        expect($catalog->discovery()['authorization_endpoint'])->toContain($url);
    }
});

it('ensures jwks_uri is properly constructed from base_url', function (): void {
    $baseUrl = 'https://sso.example.com';
    config(['sso.base_url' => $baseUrl]);

    $catalog = new PrototypeOidcCatalog(app('App\Services\Oidc\SigningKeyService'));

    expect($catalog->discovery()['jwks_uri'])
        ->toBe($baseUrl.'/jwks');
});

it('ensures all endpoint URLs are prefixed with base_url', function (): void {
    $baseUrl = 'https://sso.example.com';
    config(['sso.base_url' => $baseUrl]);

    $catalog = new PrototypeOidcCatalog(app('App\Services\Oidc\SigningKeyService'));
    $discovery = $catalog->discovery();

    expect($discovery['authorization_endpoint'])
        ->toStartWith($baseUrl)
        ->and($discovery['token_endpoint'])
        ->toStartWith($baseUrl)
        ->and($discovery['userinfo_endpoint'])
        ->toStartWith($baseUrl)
        ->and($discovery['jwks_uri'])
        ->toStartWith($baseUrl)
        ->and($discovery['revocation_endpoint'])
        ->toStartWith($baseUrl)
        ->and($discovery['end_session_endpoint'])
        ->toStartWith($baseUrl);
});
