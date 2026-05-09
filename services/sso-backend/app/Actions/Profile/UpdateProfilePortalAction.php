<?php

declare(strict_types=1);

namespace App\Actions\Profile;

use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Profile\ProfilePortalPresenter;
use App\Support\Oidc\OidcScope;
use App\Support\Oidc\ScopeSet;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;
use Throwable;

final class UpdateProfilePortalAction
{
    public function __construct(
        private readonly AccessTokenGuard $tokens,
        private readonly ProfilePortalPresenter $profiles,
        private readonly AdminAuditLogger $audit,
    ) {}

    /**
     * @param  array<string, mixed>  $input
     */
    public function handle(Request $request, array $input): JsonResponse
    {
        try {
            $claims = $this->tokens->claimsFrom((string) $request->bearerToken());
            $this->assertProfileScope($claims);
            $user = $this->user($claims);
            $changed = $this->update($user, $input);
            $this->auditSuccess($request, $user, $changed);

            return $this->noStore(response()->json($this->profiles->present($user->refresh(), $claims)));
        } catch (RuntimeException) {
            return OidcErrorResponse::json('insufficient_scope', 'The profile scope is required.', 403);
        } catch (Throwable $exception) {
            $this->auditFailure($request, $exception);

            return response()->json(['error' => 'Profile update failed.'], 422);
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function assertProfileScope(array $claims): void
    {
        $scope = is_string($claims['scope'] ?? null) ? $claims['scope'] : '';

        if (! ScopeSet::contains(ScopeSet::fromString($scope), OidcScope::PROFILE)) {
            throw new RuntimeException('profile scope is required.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function user(array $claims): User
    {
        return User::query()->where('subject_id', (string) $claims['sub'])->firstOrFail();
    }

    /**
     * @param  array<string, mixed>  $input
     * @return list<string>
     */
    private function update(User $user, array $input): array
    {
        $before = $user->only($this->editableFields());
        $user->forceFill(array_intersect_key($input, array_flip($this->editableFields())))->save();

        return array_keys(array_diff_assoc($user->refresh()->only($this->editableFields()), $before));
    }

    /**
     * @return list<string>
     */
    private function editableFields(): array
    {
        return ['display_name', 'given_name', 'family_name'];
    }

    /**
     * @param  list<string>  $changedFields
     */
    private function auditSuccess(Request $request, User $user, array $changedFields): void
    {
        $this->audit->succeeded('update_profile_portal', $request, $user, [
            'subject_id' => $user->subject_id,
            'changed_fields' => $changedFields,
        ], AdminAuditTaxonomy::PROFILE_SELF_UPDATE);
    }

    private function auditFailure(Request $request, Throwable $exception): void
    {
        $this->audit->denied('update_profile_portal', $request, null, $exception->getMessage(), [
            'changed_fields' => [],
        ], AdminAuditTaxonomy::PROFILE_SELF_UPDATE);
    }

    private function noStore(JsonResponse $response): JsonResponse
    {
        return $response->withHeaders([
            'Cache-Control' => 'no-store, no-cache, must-revalidate, private',
            'Pragma' => 'no-cache',
        ]);
    }
}
