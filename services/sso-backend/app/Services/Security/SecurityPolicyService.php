<?php

declare(strict_types=1);

namespace App\Services\Security;

use App\Models\SecurityPolicy;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Support\Rbac\AdminPermission;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Throwable;

/**
 * FR-055 / BE-FR055-001 — versioned security policy aggregate.
 *
 * Operators propose drafts, activate exactly one version per category, and
 * roll back to a prior version. Every state change is audited and runtime
 * readers consume the active row through {@see active()} which caches the
 * payload for {@see CACHE_TTL_SECONDS} seconds.
 */
final class SecurityPolicyService
{
    public const CACHE_TTL_SECONDS = 60;

    private const CACHE_KEY_PREFIX = 'sso:security-policy:active:';

    public function __construct(private readonly AdminAuditLogger $audit) {}

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listForCategory(string $category): array
    {
        $this->assertCategory($category);

        return SecurityPolicy::query()
            ->where('category', $category)
            ->orderByDesc('version')
            ->get()
            ->map(fn (SecurityPolicy $policy): array => $this->present($policy))
            ->all();
    }

    /**
     * Resolve the active policy payload, falling back to {@see $defaults}
     * when no `active` row exists for the category.
     *
     * @param  array<string, mixed>  $defaults
     * @return array<string, mixed>
     */
    public function active(string $category, array $defaults = []): array
    {
        $this->assertCategory($category);

        /** @var array<string, mixed>|null $cached */
        $cached = Cache::remember(
            $this->cacheKey($category),
            self::CACHE_TTL_SECONDS,
            function () use ($category): ?array {
                $row = SecurityPolicy::query()
                    ->where('category', $category)
                    ->where('status', SecurityPolicy::STATUS_ACTIVE)
                    ->first();

                return $row instanceof SecurityPolicy ? $row->payload : null;
            },
        );

        return is_array($cached) ? array_merge($defaults, $cached) : $defaults;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function propose(Request $request, string $adminSubjectId, string $category, array $payload, ?string $reason = null): array
    {
        $this->assertCategory($category);

        $next = $this->nextVersion($category);

        return DB::transaction(function () use ($request, $adminSubjectId, $category, $payload, $reason, $next): array {
            $policy = SecurityPolicy::query()->create([
                'category' => $category,
                'version' => $next,
                'status' => SecurityPolicy::STATUS_DRAFT,
                'payload' => $payload,
                'actor_subject_id' => $adminSubjectId,
                'reason' => $this->trimNullable($reason),
            ]);

            $this->record($request, 'propose_security_policy', $policy, ['payload' => $payload]);

            return $this->present($policy);
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function activate(Request $request, string $adminSubjectId, string $category, int $version, ?string $reason = null, ?Carbon $effectiveAt = null): array
    {
        $this->assertCategory($category);

        return DB::transaction(function () use ($request, $adminSubjectId, $category, $version, $reason, $effectiveAt): array {
            $target = $this->lockedQuery($category)->where('version', $version)->first();

            if (! $target instanceof SecurityPolicy) {
                throw new InvalidArgumentException('Security policy version not found.');
            }

            if ($target->status === SecurityPolicy::STATUS_ROLLED_BACK) {
                throw new InvalidArgumentException('Rolled-back versions cannot be re-activated; clone into a new version.');
            }

            $now = Carbon::now();

            $this->lockedQuery($category)
                ->where('status', SecurityPolicy::STATUS_ACTIVE)
                ->update([
                    'status' => SecurityPolicy::STATUS_SUPERSEDED,
                    'superseded_at' => $now,
                    'updated_at' => $now,
                ]);

            $target->status = SecurityPolicy::STATUS_ACTIVE;
            $target->activated_at = $now;
            $target->effective_at = $effectiveAt ?? $now;
            $target->actor_subject_id = $adminSubjectId;
            $target->reason = $this->trimNullable($reason) ?? $target->reason;
            $target->save();

            $this->forgetCache($category);
            $this->record($request, 'activate_security_policy', $target, ['effective_at' => $target->effective_at->toISOString()]);

            return $this->present($target);
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function rollback(Request $request, string $adminSubjectId, string $category, int $toVersion, ?string $reason = null): array
    {
        $this->assertCategory($category);

        return DB::transaction(function () use ($request, $adminSubjectId, $category, $toVersion, $reason): array {
            $target = $this->lockedQuery($category)->where('version', $toVersion)->first();

            if (! $target instanceof SecurityPolicy) {
                throw new InvalidArgumentException('Security policy version not found.');
            }

            $now = Carbon::now();
            $current = $this->lockedQuery($category)->where('status', SecurityPolicy::STATUS_ACTIVE)->first();

            if ($current instanceof SecurityPolicy && $current->id !== $target->id) {
                $current->status = SecurityPolicy::STATUS_ROLLED_BACK;
                $current->superseded_at = $now;
                $current->save();
            }

            $target->status = SecurityPolicy::STATUS_ACTIVE;
            $target->activated_at = $now;
            $target->effective_at = $now;
            $target->actor_subject_id = $adminSubjectId;
            $target->reason = $this->trimNullable($reason) ?? $target->reason;
            $target->save();

            $this->forgetCache($category);
            $this->record($request, 'rollback_security_policy', $target, [
                'reason' => $this->trimNullable($reason),
                'rolled_back_from' => $current?->version,
            ]);

            return $this->present($target);
        });
    }

    public function flushCache(string $category): void
    {
        $this->assertCategory($category);
        $this->forgetCache($category);
    }

    public function hasLegalHold(string $subjectId): bool
    {
        $policy = $this->active('legal_hold', [
            'enabled' => false,
            'subject_ids' => [],
        ]);

        return (bool) ($policy['enabled'] ?? false)
            && in_array($subjectId, $this->legalHoldSubjects($policy), true);
    }

    /**
     * @param  array<string, mixed>  $policy
     * @return list<string>
     */
    private function legalHoldSubjects(array $policy): array
    {
        $subjects = $policy['subject_ids'] ?? [];
        if (! is_array($subjects)) {
            return [];
        }

        return array_values(array_filter($subjects, 'is_string'));
    }

    private function assertCategory(string $category): void
    {
        if (! in_array($category, SecurityPolicy::CATEGORIES, true)) {
            throw new InvalidArgumentException('Unknown security policy category.');
        }
    }

    private function nextVersion(string $category): int
    {
        return ((int) SecurityPolicy::query()->where('category', $category)->max('version')) + 1;
    }

    /**
     * @return Builder<SecurityPolicy>
     */
    private function lockedQuery(string $category): Builder
    {
        $query = SecurityPolicy::query()->where('category', $category);

        try {
            $query->lockForUpdate();
        } catch (Throwable) {
            // SQLite (used in some test paths) doesn't honour pessimistic
            // locks. The transaction wrapping the call still serialises
            // the per-category mutation under MySQL/Postgres.
        }

        return $query;
    }

    private function forgetCache(string $category): void
    {
        Cache::forget($this->cacheKey($category));
    }

    private function cacheKey(string $category): string
    {
        return self::CACHE_KEY_PREFIX.$category;
    }

    private function trimNullable(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function record(Request $request, string $action, SecurityPolicy $policy, array $context = []): void
    {
        $admin = $request->attributes->get('admin_user');

        if (! $admin instanceof User) {
            return;
        }

        $this->audit->succeeded(
            $action,
            $request,
            $admin,
            array_merge([
                'permission' => AdminPermission::SECURITY_POLICY_WRITE,
                'category' => $policy->category,
                'version' => $policy->version,
                'status' => $policy->status,
            ], $context),
            AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function present(SecurityPolicy $policy): array
    {
        return [
            'id' => $policy->id,
            'category' => $policy->category,
            'version' => $policy->version,
            'status' => $policy->status,
            'payload' => $policy->payload,
            'effective_at' => $policy->effective_at?->toISOString(),
            'activated_at' => $policy->activated_at?->toISOString(),
            'superseded_at' => $policy->superseded_at?->toISOString(),
            'actor_subject_id' => $policy->actor_subject_id,
            'reason' => $policy->reason,
            'created_at' => $policy->created_at->toISOString(),
            'updated_at' => $policy->updated_at->toISOString(),
        ];
    }
}
