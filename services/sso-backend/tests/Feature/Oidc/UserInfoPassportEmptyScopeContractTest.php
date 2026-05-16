<?php

declare(strict_types=1);

use App\Models\User;
use Database\Seeders\PassportClientSeeder;
use Laravel\Passport\Passport;

beforeEach(function (): void {
    $this->seed(PassportClientSeeder::class);
});

it('omits profile/email claims at /userinfo for a Passport-authenticated request whose token scopes are empty', function (): void {
    $user = User::factory()->create([
        'email' => 'user@scope-tight.example.test',
    ]);

    Passport::actingAs($user, []);

    $response = $this->getJson('/userinfo');

    $response->assertOk()
        ->assertJsonPath('sub', $user->subject_id)
        ->assertJsonMissing(['email' => $user->email])
        ->assertJsonMissing(['name' => $user->display_name])
        ->assertJsonMissing(['given_name' => $user->given_name])
        ->assertJsonMissing(['family_name' => $user->family_name]);
});

it('returns scope-bound profile/email claims at /userinfo when the Passport token explicitly carries those scopes', function (): void {
    $user = User::factory()->create([
        'email' => 'user@scope-explicit.example.test',
    ]);

    Passport::actingAs($user, ['openid', 'profile', 'email']);

    $response = $this->getJson('/userinfo');

    $response->assertOk()
        ->assertJsonPath('sub', $user->subject_id)
        ->assertJsonPath('email', $user->email);
});
