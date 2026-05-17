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
        private readonly DsrPiiTableCoverageGuard $coverage,
    ) {}

    /** @return array<string, mixed> */
    public function preview(DataSubjectRequest $request): array
    {
        return match ($request->type) {
            DataSubjectRequestService::TYPE_EXPORT => $this->exportBuilder->build($request->subject_id),
            DataSubjectRequestService::TYPE_DELETE => $this->destructivePreview($request, 'Subject account will be deleted.'),
            DataSubjectRequestService::TYPE_ANONYMIZE => $this->destructivePreview($request, 'Subject account will be anonymized.'),
            default => throw new RuntimeException('Unsupported DSR type.'),
        };
    }

    /** @return array<string, mixed> */
    public function fulfill(DataSubjectRequest $request): array
    {
        return match ($request->type) {
            DataSubjectRequestService::TYPE_EXPORT => $this->exportBuilder->build($request->subject_id),
            DataSubjectRequestService::TYPE_DELETE => $this->deleteSubject($request),
            DataSubjectRequestService::TYPE_ANONYMIZE => $this->anonymizeSubject($request),
            default => throw new RuntimeException('Unsupported DSR type.'),
        };
    }

    /** @return array<string, mixed> */
    private function destructivePreview(DataSubjectRequest $request, string $summary): array
    {
        $this->coverage->assertCovered();

        return [...$this->summary($request, $summary), 'table_counts' => $this->tableCounts($request), 'would_delete' => true];
    }

    /** @return array<string, mixed> */
    private function deleteSubject(DataSubjectRequest $request): array
    {
        return DB::transaction(function () use ($request): array {
            $this->coverage->assertCovered();
            $user = $this->subject($request);
            $counts = $this->eraseLinkedData($user, $request->subject_id);
            $counts['users'] = (int) $user->delete();

            return [...$this->summary($request, 'Subject account deleted.'), 'table_counts' => $counts];
        });
    }

    /** @return array<string, mixed> */
    private function anonymizeSubject(DataSubjectRequest $request): array
    {
        return DB::transaction(function () use ($request): array {
            $this->coverage->assertCovered();
            $user = $this->subject($request);
            $counts = $this->eraseLinkedData($user, $request->subject_id);
            $user->forceFill($this->anonymizedProfile($request))->save();

            return [...$this->summary($request, 'Subject account anonymized.'), 'table_counts' => [...$counts, 'users' => 1]];
        });
    }

    /** @return array<string, int> */
    private function eraseLinkedData(User $user, string $subjectId): array
    {
        $tokenIds = $this->passportTokenIds($user->id);

        return [
            'external_subject_links' => DB::table('external_subject_links')->where('user_id', $user->id)->delete(),
            'mfa_credentials' => DB::table('mfa_credentials')->where('user_id', $user->id)->delete(),
            'mfa_recovery_codes' => DB::table('mfa_recovery_codes')->where('user_id', $user->id)->delete(),
            'user_consents' => DB::table('user_consents')->where('subject_id', $subjectId)->delete(),
            'sso_sessions' => $this->revokePortalSessions($subjectId),
            'oidc_rp_sessions' => $this->revokeRpSessions($subjectId),
            'oauth_access_tokens' => $this->revokePassportAccessTokens($tokenIds),
            'oauth_refresh_tokens' => $this->revokePassportRefreshTokens($tokenIds),
            'refresh_token_rotations' => count($this->refreshTokens->revokeSubject($subjectId)),
            'password_reset_tokens' => $this->clearPasswordResetToken($user),
        ];
    }

    /** @return array<string, int> */
    private function tableCounts(DataSubjectRequest $request): array
    {
        $user = $this->subject($request);
        $tokenIds = $this->passportTokenIds($user->id);

        return [
            'users' => 1,
            'external_subject_links' => $this->count('external_subject_links', 'user_id', $user->id),
            'mfa_credentials' => $this->count('mfa_credentials', 'user_id', $user->id),
            'mfa_recovery_codes' => $this->count('mfa_recovery_codes', 'user_id', $user->id),
            'user_consents' => $this->count('user_consents', 'subject_id', $request->subject_id),
            'sso_sessions' => $this->count('sso_sessions', 'subject_id', $request->subject_id),
            'oidc_rp_sessions' => $this->count('oidc_rp_sessions', 'subject_id', $request->subject_id),
            'oauth_access_tokens' => count($tokenIds),
            'oauth_refresh_tokens' => $this->countRefreshTokens($tokenIds),
            'refresh_token_rotations' => $this->count('refresh_token_rotations', 'subject_id', $request->subject_id),
            'password_reset_tokens' => $user->password_reset_token_hash === null ? 0 : 1,
        ];
    }

    /** @return list<string> */
    private function passportTokenIds(int $userId): array
    {
        return DB::table('oauth_access_tokens')
            ->where('user_id', $userId)
            ->pluck('id')
            ->filter(fn (mixed $id): bool => is_string($id) && $id !== '')
            ->values()
            ->all();
    }

    /** @param list<string> $tokenIds */
    private function revokePassportAccessTokens(array $tokenIds): int
    {
        if ($tokenIds === []) {
            return 0;
        }

        return DB::table('oauth_access_tokens')->whereIn('id', $tokenIds)->update(['revoked' => true, 'updated_at' => now()]);
    }

    /** @param list<string> $tokenIds */
    private function revokePassportRefreshTokens(array $tokenIds): int
    {
        if ($tokenIds === []) {
            return 0;
        }

        return DB::table('oauth_refresh_tokens')->whereIn('access_token_id', $tokenIds)->update(['revoked' => true]);
    }

    private function revokePortalSessions(string $subjectId): int
    {
        return DB::table('sso_sessions')->where('subject_id', $subjectId)->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);
    }

    private function revokeRpSessions(string $subjectId): int
    {
        return DB::table('oidc_rp_sessions')->where('subject_id', $subjectId)->whereNull('revoked_at')->update(['revoked_at' => now()]);
    }

    private function clearPasswordResetToken(User $user): int
    {
        $hadToken = $user->password_reset_token_hash !== null;
        $user->forceFill(['password_reset_token_hash' => null, 'password_reset_token_expires_at' => null])->save();

        return $hadToken ? 1 : 0;
    }

    private function subject(DataSubjectRequest $request): User
    {
        $user = User::query()->where('subject_id', $request->subject_id)->first();
        if ($user instanceof User) {
            return $user;
        }

        throw new RuntimeException('Data subject account not found.');
    }

    /** @return array<string, mixed> */
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

    private function count(string $table, string $column, int|string $value): int
    {
        return DB::table($table)->where($column, $value)->count();
    }

    /** @param list<string> $tokenIds */
    private function countRefreshTokens(array $tokenIds): int
    {
        return $tokenIds === [] ? 0 : DB::table('oauth_refresh_tokens')->whereIn('access_token_id', $tokenIds)->count();
    }

    /** @return array<string, mixed> */
    private function summary(DataSubjectRequest $request, string $summary): array
    {
        return ['summary' => $summary, 'subject_id' => $request->subject_id, 'type' => $request->type];
    }
}
