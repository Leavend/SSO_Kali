<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Config;

it('allows credentialed portal preflight with an explicit origin', function (): void {
    Config::set('cors.allowed_origins', ['https://sso.timeh.my.id']);
    Config::set('cors.supports_credentials', true);

    $this->withHeaders([
        'Origin' => 'https://sso.timeh.my.id',
        'Access-Control-Request-Method' => 'POST',
        'Access-Control-Request-Headers' => 'content-type,x-request-id',
    ])
        ->options('/api/auth/login')
        ->assertNoContent()
        ->assertHeader('Access-Control-Allow-Origin', 'https://sso.timeh.my.id')
        ->assertHeader('Access-Control-Allow-Credentials', 'true')
        ->assertHeader('Vary', 'Origin');
});

it('does not emit wildcard origin for credentialed portal requests', function (): void {
    Config::set('cors.allowed_origins', ['https://sso.timeh.my.id']);
    Config::set('cors.supports_credentials', true);

    $response = $this->withHeaders([
        'Origin' => 'https://sso.timeh.my.id',
        'Access-Control-Request-Method' => 'POST',
    ])->options('/api/auth/login');

    expect($response->headers->get('Access-Control-Allow-Origin'))->not->toBe('*');
});

it('sanitizes wildcard configuration when credentials are supported', function (): void {
    $config = require base_path('config/cors.php');

    expect($config['supports_credentials'])
        ->toBeTrue()
        ->and($config['allowed_origins'])
        ->not->toContain('*');
});
