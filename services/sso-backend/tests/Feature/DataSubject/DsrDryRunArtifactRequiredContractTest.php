<?php

declare(strict_types=1);

use App\Actions\DataSubject\FulfillDataSubjectRequestAction;
use App\Models\AdminAuditEvent;
use App\Models\DataSubjectRequest;
use App\Models\DsrFulfillmentArtifact;
use App\Models\User;
use Illuminate\Http\Request;

it('requires a recent dry-run artifact before destructive DSR execution', function (): void {
    $subject = dsrArtifactUser('dry-run-required-subject');
    $request = dsrArtifactRequest($subject, 'delete');

    app(FulfillDataSubjectRequestAction::class)
        ->execute($request->request_id, dsrArtifactReviewer(), dsrAuditRequest(), true);

    expect(DsrFulfillmentArtifact::query()->where('data_subject_request_id', $request->id)->where('dry_run', true)->count())
        ->toBe(1)
        ->and(User::query()->whereKey($subject->id)->exists())->toBeTrue();

    $result = app(FulfillDataSubjectRequestAction::class)
        ->execute($request->request_id, dsrArtifactReviewer(), dsrAuditRequest(), false);

    expect($result['dry_run'])->toBeFalse()
        ->and($result['artifact']['table_counts'])->toHaveKey('users')
        ->and(User::query()->whereKey($subject->id)->exists())->toBeFalse();
});

it('rejects destructive DSR execution when dry-run artifact is expired', function (): void {
    $subject = dsrArtifactUser('expired-dry-run-subject');
    $request = dsrArtifactRequest($subject, 'delete');

    $preview = app(FulfillDataSubjectRequestAction::class)
        ->execute($request->request_id, dsrArtifactReviewer(), dsrAuditRequest(), true);

    DsrFulfillmentArtifact::query()
        ->whereKey($preview['artifact_id'])
        ->update(['expires_at' => now()->subMinute()]);

    app(FulfillDataSubjectRequestAction::class)
        ->execute($request->request_id, dsrArtifactReviewer(), dsrAuditRequest(), false);
})->throws(RuntimeException::class, 'DSR execute requires recent dry-run artifact.');

it('rejects destructive DSR execution when dry-run artifact hash is tampered', function (): void {
    $subject = dsrArtifactUser('tampered-dry-run-subject');
    $request = dsrArtifactRequest($subject, 'delete');

    $preview = app(FulfillDataSubjectRequestAction::class)
        ->execute($request->request_id, dsrArtifactReviewer(), dsrAuditRequest(), true);

    DsrFulfillmentArtifact::query()
        ->whereKey($preview['artifact_id'])
        ->update(['hash' => str_repeat('0', 64)]);

    app(FulfillDataSubjectRequestAction::class)
        ->execute($request->request_id, dsrArtifactReviewer(), dsrAuditRequest(), false);
})->throws(RuntimeException::class, 'DSR execute requires recent dry-run artifact.');

it('records DSR dry-run artifact id hash legal hold status and PII counts in audit context', function (): void {
    $subject = dsrArtifactUser('audit-dry-run-subject');
    $request = dsrArtifactRequest($subject, 'delete');

    $result = app(FulfillDataSubjectRequestAction::class)
        ->execute($request->request_id, dsrArtifactReviewer(), dsrAuditRequest(), true);

    $event = AdminAuditEvent::query()
        ->where('action', 'fulfill_data_subject_request')
        ->latest('id')
        ->firstOrFail();

    expect($event->context['dry_run'])->toBeTrue()
        ->and($event->context['artifact_id'])->toBe($result['artifact_id'])
        ->and($event->context['artifact_hash'])->toBeString()
        ->and($event->context['legal_hold_status'])->toBe('clear')
        ->and($event->context['pii_table_counts'])->toHaveKey('users');
});

function dsrArtifactUser(string $subjectId): User
{
    return User::query()->create([
        'subject_id' => $subjectId,
        'subject_uuid' => $subjectId,
        'email' => $subjectId.'@example.test',
        'password' => 'password',
        'given_name' => 'DSR',
        'family_name' => 'Subject',
        'display_name' => 'DSR Subject',
        'role' => 'user',
        'status' => 'active',
        'local_account_enabled' => true,
        'password_reset_token_hash' => password_hash('reset-token', PASSWORD_BCRYPT),
        'password_reset_token_expires_at' => now()->addHour(),
        'email_verified_at' => now(),
    ]);
}

function dsrArtifactRequest(User $subject, string $type): DataSubjectRequest
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

function dsrArtifactReviewer(): User
{
    return User::query()->firstOrCreate(
        ['subject_id' => 'admin-dsr-artifact'],
        [
            'subject_uuid' => 'admin-dsr-artifact',
            'email' => 'admin-dsr-artifact@example.test',
            'password' => 'password',
            'given_name' => 'Admin',
            'family_name' => 'DSR',
            'display_name' => 'Admin DSR',
            'role' => 'admin',
            'status' => 'active',
            'local_account_enabled' => true,
            'email_verified_at' => now(),
        ],
    );
}

function dsrAuditRequest(): Request
{
    return Request::create('/admin/api/data-subject-requests/test/fulfill', 'POST');
}
