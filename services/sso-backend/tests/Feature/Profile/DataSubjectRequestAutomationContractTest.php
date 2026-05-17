<?php

declare(strict_types=1);

use App\Actions\DataSubject\FulfillDataSubjectRequestAction;
use App\Jobs\FulfillApprovedDataSubjectRequestJob;
use App\Models\AdminAuditEvent;
use App\Models\DataSubjectRequest;
use App\Models\ExternalIdentityProvider;
use App\Models\ExternalSubjectLink;
use App\Models\MfaCredential;
use App\Models\MfaRecoveryCode;
use App\Models\User;
use App\Models\UserConsent;
use App\Services\Oidc\LocalTokenService;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;

it('seeds the system reviewer required by DSR automation', function (): void {
    $this->seed(DatabaseSeeder::class);

    expect(User::query()->where('subject_id', 'system-dsr-automation')->exists())->toBeTrue();
});

it('dispatches approved data subject requests automatically', function (): void {
    Bus::fake();
    $this->seed(RbacSeeder::class);
    config()->set('sso.admin.mfa.enforced', false);
    $admin = User::factory()->create(['subject_id' => 'admin-dsr-automation', 'role' => 'admin']);
    $request = submittedDataSubjectRequest(User::factory()->create(), 'delete');

    User::factory()->create(['subject_id' => 'system-dsr-automation', 'role' => 'admin']);

    $this->withToken(adminDataSubjectToken($admin))
        ->postJson('/admin/api/data-subject-requests/'.$request->request_id.'/review', [
            'decision' => 'approved',
        ])
        ->assertOk();

    expect(Artisan::call('sso:queue-dsr-fulfillments'))->toBe(0);

    Bus::assertDispatched(FulfillApprovedDataSubjectRequestJob::class, function (FulfillApprovedDataSubjectRequestJob $job) use ($request): bool {
        return $job->requestId === $request->request_id;
    });
});

it('deletes subject PII and linked security material when delete DSR job runs', function (): void {
    $subject = seededDataSubjectAccount('delete-dsr-subject');
    $request = approvedDataSubjectRequest($subject, 'delete');

    runDsrDryRun($request);
    runDsrJob($request);

    expect(User::query()->whereKey($subject->id)->exists())->toBeFalse()
        ->and(ExternalSubjectLink::query()->where('user_id', $subject->id)->exists())->toBeFalse()
        ->and(MfaCredential::query()->where('user_id', $subject->id)->exists())->toBeFalse()
        ->and(MfaRecoveryCode::query()->where('user_id', $subject->id)->exists())->toBeFalse()
        ->and(UserConsent::query()->where('subject_id', $subject->subject_id)->exists())->toBeFalse()
        ->and(dsrStatus($request))->toBe('fulfilled')
        ->and(AdminAuditEvent::query()->where('action', 'fulfill_data_subject_request')->exists())->toBeTrue();
});

it('anonymizes account while removing linked sessions consents MFA and external links', function (): void {
    $subject = seededDataSubjectAccount('anon-dsr-subject');
    $request = approvedDataSubjectRequest($subject, 'anonymize');

    runDsrDryRun($request);
    runDsrJob($request);

    $subject->refresh();
    expect($subject->email)->toBe('anon-'.$request->request_id.'@anonymous.invalid')
        ->and($subject->display_name)->toBe('Anonymous User')
        ->and($subject->password)->toBeNull()
        ->and($subject->status)->toBe('disabled')
        ->and(ExternalSubjectLink::query()->where('user_id', $subject->id)->exists())->toBeFalse()
        ->and(MfaCredential::query()->where('user_id', $subject->id)->exists())->toBeFalse()
        ->and(MfaRecoveryCode::query()->where('user_id', $subject->id)->exists())->toBeFalse()
        ->and(UserConsent::query()->where('subject_id', $subject->subject_id)->exists())->toBeFalse()
        ->and(dsrStatus($request))->toBe('fulfilled');
});

function runDsrDryRun(DataSubjectRequest $request): void
{
    app(FulfillDataSubjectRequestAction::class)
        ->execute($request->request_id, automationReviewer(), Request::create('/system/data-subject-requests/'.$request->request_id.'/fulfill', 'POST'), true);
}

function runDsrJob(DataSubjectRequest $request): void
{
    $job = new FulfillApprovedDataSubjectRequestJob($request->request_id, automationReviewer()->id);
    $job->handle(app(FulfillDataSubjectRequestAction::class));
}

function dsrStatus(DataSubjectRequest $request): string
{
    return (string) DataSubjectRequest::query()->where('request_id', $request->request_id)->value('status');
}

function submittedDataSubjectRequest(User $subject, string $type): DataSubjectRequest
{
    return dataSubjectRequest($subject, $type, 'submitted');
}

function approvedDataSubjectRequest(User $subject, string $type): DataSubjectRequest
{
    return dataSubjectRequest($subject, $type, 'approved');
}

function dataSubjectRequest(User $subject, string $type, string $status): DataSubjectRequest
{
    return DataSubjectRequest::query()->create([
        'request_id' => '01J'.strtoupper(substr(hash('sha256', $subject->subject_id.$type.$status), 0, 23)),
        'subject_id' => $subject->subject_id,
        'type' => $type,
        'status' => $status,
        'submitted_at' => now()->subDay(),
        'reviewed_at' => $status === 'approved' ? now()->subHour() : null,
    ]);
}

function seededDataSubjectAccount(string $subjectId): User
{
    $user = User::factory()->create(['subject_id' => $subjectId, 'email' => $subjectId.'@example.test']);
    seedExternalSubjectLink($user, $subjectId);
    MfaCredential::query()->create(['user_id' => $user->id, 'method' => 'totp', 'secret' => 'secret', 'algorithm' => 'SHA1', 'digits' => 6, 'period' => 30, 'verified_at' => now()]);
    MfaRecoveryCode::query()->create(['user_id' => $user->id, 'code_hash' => password_hash('code', PASSWORD_BCRYPT), 'created_at' => now()]);
    UserConsent::query()->create(['subject_id' => $user->subject_id, 'client_id' => 'app-a', 'scopes' => ['openid'], 'granted_at' => now()]);
    seedPortalSession($user);

    return $user;
}

function seedExternalSubjectLink(User $user, string $subjectId): void
{
    $provider = ExternalIdentityProvider::query()->create([
        'provider_key' => 'dsr-'.$subjectId,
        'display_name' => 'DSR Provider',
        'issuer' => 'https://idp.example.test/'.$subjectId,
        'metadata_url' => 'https://idp.example.test/'.$subjectId.'/.well-known/openid-configuration',
        'client_id' => 'client-'.$subjectId,
        'client_secret_encrypted' => encrypt('secret'),
        'allowed_algorithms' => ['RS256'],
        'scopes' => ['openid', 'email'],
        'enabled' => true,
    ]);

    ExternalSubjectLink::query()->create([
        'user_id' => $user->id,
        'external_identity_provider_id' => $provider->id,
        'provider_key' => $provider->provider_key,
        'issuer' => $provider->issuer,
        'external_subject' => 'external-'.$subjectId,
        'email' => $user->email,
        'email_verified_at' => now(),
    ]);
}

function seedPortalSession(User $user): void
{
    DB::table('sso_sessions')->insert([
        'session_id' => 'session-'.$user->subject_id,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'authenticated_at' => now(),
        'expires_at' => now()->addHour(),
        'created_at' => now(),
        'updated_at' => now(),
    ]);
}

function automationReviewer(): User
{
    return User::query()->firstOrCreate(
        ['subject_id' => 'system-dsr-automation'],
        [
            'subject_uuid' => 'system-dsr-automation',
            'email' => 'system-dsr-automation@example.test',
            'password' => 'password',
            'given_name' => 'System',
            'family_name' => 'Automation',
            'display_name' => 'System DSR Automation',
            'role' => 'admin',
            'status' => 'active',
            'local_account_enabled' => true,
            'email_verified_at' => now(),
        ],
    );
}

function adminDataSubjectToken(User $user): string
{
    return (string) app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-dsr-'.$user->subject_id,
        'subject_id' => $user->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ])['access_token'];
}
