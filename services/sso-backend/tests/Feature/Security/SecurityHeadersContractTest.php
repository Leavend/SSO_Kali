<?php

declare(strict_types=1);

use Tests\TestCase;

it('sets defense-in-depth security headers on backend browser-facing responses', function (): void {
    /** @var TestCase $this */
    $this->getJson('/.well-known/openid-configuration')
        ->assertOk()
        ->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
        ->assertHeader('X-Frame-Options', 'DENY')
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('Referrer-Policy', 'no-referrer')
        ->assertHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
        ->assertHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
});

it('sets security headers on front-channel logout error responses', function (): void {
    /** @var TestCase $this */
    $response = $this->get('/connect/logout/frontchannel')
        ->assertStatus(401)
        ->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
        ->assertHeader('X-Frame-Options', 'DENY')
        ->assertHeader('X-Content-Type-Options', 'nosniff');

    expect($response->headers->get('Content-Security-Policy'))->toContain("frame-ancestors 'none'");
});

it('documents backend Caddy edge headers for HSTS and CSP', function (): void {
    $caddyfile = file_get_contents(base_path('docker/frankenphp/Caddyfile'));

    expect($caddyfile)
        ->toContain('Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"')
        ->toContain('Content-Security-Policy')
        ->toContain("frame-ancestors 'none'");
});
