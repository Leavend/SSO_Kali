<?php

declare(strict_types=1);

use App\Models\OidcClientEntitlement;
use App\Models\User;

function activeEntitlement(string $clientId, User $user): bool
{
    return OidcClientEntitlement::query()
        ->where('client_id', $clientId)
        ->where('user_id', $user->getKey())
        ->whereNull('revoked_at')
        ->exists();
}

it('grants entitlement for a single subject', function (): void {
    $user = User::factory()->create(['subject_id' => 'subj-single', 'role' => 'pegawai']);

    $this->artisan('sso:client-entitlement', [
        'action' => 'grant',
        'client_id' => 'kepegawaian-app',
        'subject_id' => 'subj-single',
    ])->assertExitCode(0);

    expect(activeEntitlement('kepegawaian-app', $user))->toBeTrue();
});

it('grants entitlement to every user with a role via --role', function (): void {
    $pegawaiA = User::factory()->create(['subject_id' => 'peg-a', 'role' => 'pegawai']);
    $pegawaiB = User::factory()->create(['subject_id' => 'peg-b', 'role' => 'pegawai']);
    $regular = User::factory()->create(['subject_id' => 'reg-c', 'role' => 'user']);

    $this->artisan('sso:client-entitlement', [
        'action' => 'grant',
        'client_id' => 'kepegawaian-app',
        '--role' => 'pegawai',
    ])->assertExitCode(0);

    expect(activeEntitlement('kepegawaian-app', $pegawaiA))->toBeTrue()
        ->and(activeEntitlement('kepegawaian-app', $pegawaiB))->toBeTrue()
        ->and(activeEntitlement('kepegawaian-app', $regular))->toBeFalse();
});

it('revokes entitlement for every user with a role via --role', function (): void {
    $pegawai = User::factory()->create(['subject_id' => 'peg-rev', 'role' => 'pegawai']);
    OidcClientEntitlement::grant('kepegawaian-app', $pegawai, 'system');

    $this->artisan('sso:client-entitlement', [
        'action' => 'revoke',
        'client_id' => 'kepegawaian-app',
        '--role' => 'pegawai',
    ])->assertExitCode(0);

    expect(activeEntitlement('kepegawaian-app', $pegawai))->toBeFalse();
});

it('fails when neither a subject id nor a role is provided', function (): void {
    $this->artisan('sso:client-entitlement', [
        'action' => 'grant',
        'client_id' => 'kepegawaian-app',
    ])->assertExitCode(1);
});
