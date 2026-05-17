<?php

declare(strict_types=1);

use App\Models\DataSubjectRequest;
use App\Models\User;
use App\Services\DataSubject\DataSubjectFulfillmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

it('previews destructive DSR with PII table counts without mutating subject data', function (): void {
    $subject = fulfillmentUnitUser('preview-dsr-subject');
    $request = fulfillmentUnitRequest($subject, 'delete');
    DB::table('sso_sessions')->insert([
        'session_id' => 'preview-session',
        'user_id' => $subject->id,
        'subject_id' => $subject->subject_id,
        'authenticated_at' => now(),
        'expires_at' => now()->addHour(),
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $artifact = app(DataSubjectFulfillmentService::class)->preview($request);

    expect($artifact['would_delete'])->toBeTrue()
        ->and($artifact['table_counts'])->toHaveKey('users')
        ->and($artifact['table_counts']['sso_sessions'])->toBe(1)
        ->and(User::query()->whereKey($subject->id)->exists())->toBeTrue()
        ->and(DB::table('sso_sessions')->where('subject_id', $subject->subject_id)->whereNull('revoked_at')->count())->toBe(1);
});

it('clears password reset token and revokes sessions when anonymizing a subject', function (): void {
    $subject = fulfillmentUnitUser('anonymize-dsr-subject');
    $request = fulfillmentUnitRequest($subject, 'anonymize');
    DB::table('sso_sessions')->insert([
        'session_id' => 'anonymize-session',
        'user_id' => $subject->id,
        'subject_id' => $subject->subject_id,
        'authenticated_at' => now(),
        'expires_at' => now()->addHour(),
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $artifact = app(DataSubjectFulfillmentService::class)->fulfill($request);

    $subject->refresh();
    expect($artifact['table_counts']['password_reset_tokens'])->toBe(1)
        ->and($subject->password_reset_token_hash)->toBeNull()
        ->and($subject->email)->toBe('anon-'.$request->request_id.'@anonymous.invalid')
        ->and(DB::table('sso_sessions')->where('subject_id', $subject->subject_id)->whereNotNull('revoked_at')->count())->toBe(1);
});

function fulfillmentUnitUser(string $subjectId): User
{
    return User::query()->create([
        'subject_id' => $subjectId,
        'subject_uuid' => $subjectId,
        'email' => $subjectId.'@example.test',
        'password' => 'password',
        'given_name' => 'Fulfillment',
        'family_name' => 'Subject',
        'display_name' => 'Fulfillment Subject',
        'role' => 'user',
        'status' => 'active',
        'local_account_enabled' => true,
        'password_reset_token_hash' => password_hash('reset-token', PASSWORD_BCRYPT),
        'password_reset_token_expires_at' => now()->addHour(),
        'email_verified_at' => now(),
    ]);
}

function fulfillmentUnitRequest(User $subject, string $type): DataSubjectRequest
{
    return DataSubjectRequest::query()->create([
        'request_id' => '01J'.strtoupper(substr(hash('sha256', $subject->subject_id.$type), 0, 23)),
        'subject_id' => $subject->subject_id,
        'type' => $type,
        'status' => 'approved',
        'submitted_at' => now()->subDay(),
        'reviewed_at' => now()->subHour(),
    ]);
}
