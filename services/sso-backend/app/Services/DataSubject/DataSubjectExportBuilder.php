<?php

declare(strict_types=1);

namespace App\Services\DataSubject;

use App\Models\AdminAuditEvent;
use App\Models\User;
use Illuminate\Support\Facades\DB;

final class DataSubjectExportBuilder
{
    /**
     * Build a sanitized export bundle. Excludes secrets (`password`,
     * `password_reset_token_hash`, `subject_uuid`, `mfa_credentials.secret`,
     * `mfa_recovery_codes.code_hash`, all `oauth_*` token tables, and admin
     * `event_hash` chain values).
     *
     * @return array<string, mixed>
     */
    public function build(string $subjectId): array
    {
        $user = User::query()->where('subject_id', $subjectId)->first();

        return [
            'subject_id' => $subjectId,
            'profile' => $user === null ? null : [
                'email' => $user->email,
                'display_name' => $user->display_name,
                'given_name' => $user->given_name,
                'family_name' => $user->family_name,
                'role' => $user->role,
                'status' => $user->status,
                'created_at' => $user->created_at?->toIso8601String(),
                'updated_at' => $user->updated_at?->toIso8601String(),
                'last_login_at' => $user->last_login_at?->toIso8601String(),
                'email_verified_at' => $user->email_verified_at?->toIso8601String(),
            ],
            'consents' => DB::table('user_consents')
                ->where('subject_id', $subjectId)
                ->get(['client_id', 'scopes', 'granted_at', 'revoked_at'])
                ->map(fn (object $row): array => (array) $row)
                ->all(),
            'sessions' => DB::table('sso_sessions')
                ->where('subject_id', $subjectId)
                ->get(['session_id', 'created_at', 'last_activity_at', 'expires_at', 'revoked_at'])
                ->map(fn (object $row): array => (array) $row)
                ->all(),
            'rp_sessions' => DB::table('oidc_rp_sessions')
                ->where('subject_id', $subjectId)
                ->get(['client_id', 'sid', 'created_at', 'last_seen_at', 'expires_at', 'revoked_at'])
                ->map(fn (object $row): array => (array) $row)
                ->all(),
            'admin_audit_self' => AdminAuditEvent::query()
                ->where('admin_subject_id', $subjectId)
                ->orderBy('id')
                ->get(['event_id', 'action', 'outcome', 'taxonomy', 'method', 'path', 'reason', 'occurred_at'])
                ->map(fn (AdminAuditEvent $event): array => $event->toArray())
                ->all(),
            'redaction_notes' => [
                'excluded_fields' => [
                    'users.password',
                    'users.password_reset_token_hash',
                    'users.subject_uuid',
                    'mfa_credentials.secret',
                    'mfa_recovery_codes.code_hash',
                    'oauth_*',
                    'admin_audit_events.event_hash',
                    'admin_audit_events.previous_hash',
                    'admin_audit_events.context',
                    'admin_audit_events.ip_address',
                ],
            ],
        ];
    }
}
