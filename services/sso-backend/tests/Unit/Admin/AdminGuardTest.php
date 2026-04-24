<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

uses(RefreshDatabase::class);

/**
 * AdminGuard middleware tests.
 *
 * Tests the authentication gate using HTTP feature tests,
 * which properly resolve the final AdminGuard from DI.
 */
it('rejects requests without bearer token with 401', function (): void {
    /** @var TestCase $this */
    /** @var TestResponse $response */
    $response = $this->getJson('/admin/api/me');

    $response->assertStatus(401)
        ->assertJsonPath('error', 'unauthorized');
});

it('rejects requests with invalid bearer token', function (): void {
    /** @var TestCase $this */
    $response = $this->getJson('/admin/api/me', [
        'Authorization' => 'Bearer clearly-invalid-token-value',
    ]);

    $response->assertStatus(401);
});

it('rejects non-bearer auth schemes', function (): void {
    /** @var TestCase $this */
    $response = $this->getJson('/admin/api/me', [
        'Authorization' => 'Basic dXNlcjpwYXNz',
    ]);

    $response->assertStatus(401);
});
