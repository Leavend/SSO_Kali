<?php

declare(strict_types=1);

use App\Models\DataSubjectRequest;
use App\Models\User;
use App\Services\Oidc\LocalTokenService;

it('validates data subject request submission with a dedicated form request', function (): void {
    $user = dataSubjectRequestUser();

    $this->withToken(dataSubjectRequestToken($user))
        ->postJson('/api/profile/data-subject-requests', [
            'type' => 'export',
            'reason' => str_repeat('x', 501),
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['reason']);

    $this->withToken(dataSubjectRequestToken($user))
        ->postJson('/api/profile/data-subject-requests', [
            'type' => 'erase-everything',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['type']);
});

it('lists only current subject data subject requests with safe presentation', function (): void {
    $user = dataSubjectRequestUser();
    $other = User::factory()->create(['subject_id' => 'dsr-other-subject']);

    DataSubjectRequest::query()->create([
        'request_id' => '01JSUBJECTREQ000000000001',
        'subject_id' => $other->subject_id,
        'type' => 'export',
        'status' => 'submitted',
        'submitted_at' => now(),
    ]);

    $created = $this->withToken(dataSubjectRequestToken($user))
        ->postJson('/api/profile/data-subject-requests', [
            'type' => 'anonymize',
            'reason' => 'Privacy request',
        ]);
    $created->assertCreated()->assertJsonPath('request.type', 'anonymize');

    $response = $this->withToken(dataSubjectRequestToken($user))
        ->getJson('/api/profile/data-subject-requests');

    $response->assertOk()
        ->assertJsonCount(1, 'requests')
        ->assertJsonPath('requests.0.request_id', $created->json('request.request_id'))
        ->assertJsonMissingPath('requests.0.context');

    expect($response->headers->get('Cache-Control'))->toContain('no-store');
});

function dataSubjectRequestUser(): User
{
    return User::factory()->create([
        'subject_id' => 'dsr-self-service-subject',
        'email' => 'dsr-self-service@example.test',
        'role' => 'user',
        'status' => 'active',
    ]);
}

function dataSubjectRequestToken(User $user): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'subject_id' => $user->subject_id,
        'client_id' => 'app-a',
        'scope' => 'openid profile email',
        'session_id' => 'dsr-self-service-session-'.$user->subject_id,
        'auth_time' => time(),
        'amr' => ['pwd'],
    ]);

    return (string) $tokens['access_token'];
}
