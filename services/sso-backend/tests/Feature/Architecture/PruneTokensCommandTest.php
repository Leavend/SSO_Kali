<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

it('prunes expired and revoked refresh tokens from the SSO store', function (): void {
    /** @var TestCase $this */
    seedRefreshTokenRow('expired-token', now()->subHour(), null);
    seedRefreshTokenRow('revoked-token', now()->addDay(), now()->subMinute());
    seedRefreshTokenRow('active-token', now()->addDay(), null);

    $this->artisan('sso:prune-tokens')
        ->expectsOutputToContain('Pruned 2 refresh token row(s).')
        ->assertSuccessful();

    expect(DB::table('refresh_token_rotations')->pluck('refresh_token_id')->all())
        ->toBe(['active-token']);
});

function seedRefreshTokenRow(string $tokenId, mixed $expiresAt, mixed $revokedAt): void
{
    DB::table('refresh_token_rotations')->insert([
        'subject_id' => 'user-1',
        'subject_uuid' => 'user-1',
        'client_id' => 'prototype-app-a',
        'refresh_token_id' => $tokenId,
        'token_family_id' => 'family-'.$tokenId,
        'family_created_at' => now()->subDay(),
        'secret_hash' => hash('sha256', $tokenId),
        'scope' => 'openid profile email',
        'session_id' => 'session-'.$tokenId,
        'auth_time' => now()->subMinute(),
        'amr' => json_encode(['pwd'], JSON_THROW_ON_ERROR),
        'acr' => null,
        'upstream_refresh_token' => null,
        'expires_at' => $expiresAt,
        'replaced_by_token_id' => null,
        'revoked_at' => $revokedAt,
        'created_at' => now()->subDay(),
        'updated_at' => now()->subMinute(),
    ]);
}
