<?php

declare(strict_types=1);

use App\Actions\DataSubject\FulfillDataSubjectRequestAction;
use App\Models\AdminAuditEvent;
use App\Models\DataSubjectRequest;
use App\Models\SecurityPolicy;
use App\Models\User;
use App\Services\Security\SecurityPolicyService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

it('moves destructive DSR to on-hold when active legal-hold policy covers the subject', function (): void {
    Cache::flush();
    $subject = legalHoldUser('legal-hold-subject');
    $request = legalHoldRequest($subject, 'delete');
    activateLegalHoldPolicy($subject->subject_id);

    $result = app(FulfillDataSubjectRequestAction::class)
        ->execute($request->request_id, legalHoldReviewer(), legalHoldAuditRequest(), false);

    expect($result['legal_hold_status'])->toBe('active')
        ->and($result['request']['status'])->toBe('on_hold')
        ->and(User::query()->whereKey($subject->id)->exists())->toBeTrue()
        ->and(AdminAuditEvent::query()->where('action', 'data_subject_request.on_hold')->exists())->toBeTrue()
        ->and(AdminAuditEvent::query()->where('action', 'fulfill_data_subject_request')->exists())->toBeFalse();
});

it('does not block destructive DSR when legal-hold policy is inactive or subject is absent', function (): void {
    Cache::flush();
    $subject = legalHoldUser('clear-legal-hold-subject');
    $request = legalHoldRequest($subject, 'delete');
    activateLegalHoldPolicy('different-subject');

    $result = app(FulfillDataSubjectRequestAction::class)
        ->execute($request->request_id, legalHoldReviewer(), legalHoldAuditRequest(), true);

    expect($result['legal_hold_status'])->toBe('clear')
        ->and(DataSubjectRequest::query()->whereKey($request->id)->value('status'))->toBe('approved')
        ->and(User::query()->whereKey($subject->id)->exists())->toBeTrue();
});

function legalHoldUser(string $subjectId): User
{
    return User::query()->create([
        'subject_id' => $subjectId,
        'subject_uuid' => $subjectId,
        'email' => $subjectId.'@example.test',
        'password' => 'password',
        'given_name' => 'Legal',
        'family_name' => 'Hold',
        'display_name' => 'Legal Hold Subject',
        'role' => 'user',
        'status' => 'active',
        'local_account_enabled' => true,
        'email_verified_at' => now(),
    ]);
}

function legalHoldRequest(User $subject, string $type): DataSubjectRequest
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

function activateLegalHoldPolicy(string $subjectId): void
{
    SecurityPolicy::query()->create([
        'category' => 'legal_hold',
        'version' => 1,
        'status' => SecurityPolicy::STATUS_ACTIVE,
        'payload' => ['enabled' => true, 'subject_ids' => [$subjectId]],
        'activated_at' => now(),
        'effective_at' => now(),
    ]);

    app(SecurityPolicyService::class)->flushCache('legal_hold');
}

function legalHoldReviewer(): User
{
    return User::query()->firstOrCreate(
        ['subject_id' => 'admin-legal-hold'],
        [
            'subject_uuid' => 'admin-legal-hold',
            'email' => 'admin-legal-hold@example.test',
            'password' => 'password',
            'given_name' => 'Admin',
            'family_name' => 'LegalHold',
            'display_name' => 'Admin Legal Hold',
            'role' => 'admin',
            'status' => 'active',
            'local_account_enabled' => true,
            'email_verified_at' => now(),
        ],
    );
}

function legalHoldAuditRequest(): Request
{
    return Request::create('/admin/api/data-subject-requests/test/fulfill', 'POST');
}
