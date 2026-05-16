<?php

declare(strict_types=1);

namespace App\Services\DataSubject;

use App\Models\DataSubjectRequest;
use App\Models\User;
use App\Services\Oidc\RefreshTokenStore;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class DataSubjectFulfillmentService
{
    public function __construct(
        private readonly DataSubjectExportBuilder $exportBuilder,
        private readonly RefreshTokenStore $refreshTokens,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function preview(DataSubjectRequest $request): array
    {
        return match ($request->type) {
            DataSubjectRequestService::TYPE_EXPORT => $this->exportBuilder->build($request->subject_id),
            DataSubjectRequestService::TYPE_DELETE => $this->summary($request, 'Subject account will be deleted.'),
            DataSubjectRequestService::TYPE_ANONYMIZE => $this->summary($request, 'Subject account will be anonymized.'),
            default => throw new RuntimeException('Unsupported DSR type.'),
        };
    }

    /**
     * @return array<string, mixed>
     */
    public function fulfill(DataSubjectRequest $request): array
    {
        return match ($request->type) {
            DataSubjectRequestService::TYPE_EXPORT => $this->exportBuilder->build($request->subject_id),
            DataSubjectRequestService::TYPE_DELETE => $this->deleteSubject($request),
            DataSubjectRequestService::TYPE_ANONYMIZE => $this->anonymizeSubject($request),
            default => throw new RuntimeException('Unsupported DSR type.'),
        };
    }

    /**
     * @return array<string, mixed>
     */
    private function deleteSubject(DataSubjectRequest $request): array
    {
        return DB::transaction(function () use ($request): array {
            $user = $this->subject($request);
            $counts = $this->eraseLinkedData($user, $request->subject_id);
            $user->delete();

            return [...$this->summary($request, 'Subject account deleted.'), 'counts' => $counts];
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function anonymizeSubject(DataSubjectRequest $request): array
    {
        return DB::transaction(function () use ($request): array {
            $user = $this->subject($request);
            $counts = $this->eraseLinkedData($user, $request->subject_id);
            $user->forceFill($this->anonymizedProfile($request))->save();

            return [...$this->summary($request, 'Subject account anonymized.'), 'counts' => $counts];
        });
    }

    /**
     * @return array<string, int>
     */
    private function eraseLinkedData(User $user, string $subjectId): array
    {
        $counts = [
            'external_links' => DB::table('external_subject_links')->where('user_id', $user->id)->delete(),
            'mfa_credentials' => DB::table('mfa_credentials')->where('user_id', $user->id)->delete(),
            'mfa_recovery_codes' => DB::table('mfa_recovery_codes')->where('user_id', $user->id)->delete(),
            'oauth_tokens' => $this->revokePassportTokens($user->id),
            'portal_sessions' => $this->revokePortalSessions($subjectId),
            'rp_sessions' => $this->revokeRpSessions($subjectId),
            'consents' => DB::table('user_consents')->where('subject_id', $subjectId)->delete(),
        ];

        $this->refreshTokens->revokeSubject($subjectId);

        return $counts;
    }

    private function revokePassportTokens(int $userId): int
    {
        $tokenIds = DB::table('oauth_access_tokens')
            ->where('user_id', $userId)
            ->pluck('id')
            ->filter(fn (mixed $id): bool => is_string($id) && $id !== '')
            ->values();

        DB::table('oauth_refresh_tokens')
            ->whereIn('access_token_id', $tokenIds)
            ->update(['revoked' => true]);

        return DB::table('oauth_access_tokens')
            ->whereIn('id', $tokenIds)
            ->update(['revoked' => true, 'updated_at' => now()]);
    }

    private function revokePortalSessions(string $subjectId): int
    {
        return DB::table('sso_sessions')
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now(), 'updated_at' => now()]);
    }

    private function revokeRpSessions(string $subjectId): int
    {
        return DB::table('oidc_rp_sessions')
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
    }

    /**
     * @return array<string, mixed>
     */
    private function anonymizedProfile(DataSubjectRequest $request): array
    {
        $anonymous = 'anon-'.$request->request_id;

        return [
            'email' => $anonymous.'@anonymous.invalid',
            'given_name' => null,
            'family_name' => null,
            'display_name' => 'Anonymous User',
            'password' => null,
            'password_reset_token_hash' => null,
            'password_reset_token_expires_at' => null,
            'email_verified_at' => null,
            'local_account_enabled' => false,
            'status' => 'disabled',
            'disabled_at' => now(),
            'disabled_reason' => 'Data subject anonymization fulfilled.',
        ];
    }

    private function subject(DataSubjectRequest $request): User
    {
        $user = User::query()->where('subject_id', $request->subject_id)->first();
        if ($user instanceof User) {
            return $user;
        }

        throw new RuntimeException('Data subject account not found.');
    }

    /**
     * @return array<string, mixed>
     */
    private function summary(DataSubjectRequest $request, string $summary): array
    {
        return [
            'summary' => $summary,
            'subject_id' => $request->subject_id,
            'type' => $request->type,
        ];
    }
}
