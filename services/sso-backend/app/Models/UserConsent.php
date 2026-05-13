<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * FR-011: User consent record.
 *
 * Tracks which scopes a user has granted to a specific client.
 * One active (non-revoked) consent per (subject_id, client_id) pair.
 *
 * @property int $id
 * @property string $subject_id
 * @property string $client_id
 * @property array<int, string> $scopes
 * @property Carbon $granted_at
 * @property Carbon|null $revoked_at
 */
final class UserConsent extends Model
{
    protected $table = 'user_consents';

    protected $fillable = [
        'subject_id',
        'client_id',
        'scopes',
        'granted_at',
        'revoked_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'scopes' => 'array',
            'granted_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    /**
     * @param  Builder<UserConsent>  $query
     * @return Builder<UserConsent>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNull('revoked_at');
    }

    /**
     * @param  Builder<UserConsent>  $query
     * @return Builder<UserConsent>
     */
    public function scopeForSubject(Builder $query, string $subjectId): Builder
    {
        return $query->where('subject_id', $subjectId);
    }

    /**
     * @param  Builder<UserConsent>  $query
     * @return Builder<UserConsent>
     */
    public function scopeForClient(Builder $query, string $clientId): Builder
    {
        return $query->where('client_id', $clientId);
    }

    /**
     * Whether this consent covers all the requested scopes.
     *
     * @param  list<string>  $requestedScopes
     */
    public function coversScopes(array $requestedScopes): bool
    {
        return array_diff($requestedScopes, $this->scopes) === [];
    }
}
