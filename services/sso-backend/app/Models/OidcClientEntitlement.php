<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $client_id
 * @property int $user_id
 * @property Carbon|null $granted_at
 * @property Carbon|null $revoked_at
 * @property string|null $granted_by_subject_id
 * @property string|null $revoked_by_subject_id
 */
final class OidcClientEntitlement extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'client_id',
        'user_id',
        'granted_at',
        'revoked_at',
        'granted_by_subject_id',
        'revoked_by_subject_id',
    ];

    public static function grant(string $clientId, User $user, ?string $actorSubjectId = null): self
    {
        /** @var self $entitlement */
        $entitlement = self::query()->updateOrCreate(
            ['client_id' => $clientId, 'user_id' => $user->getKey()],
            [
                'granted_at' => now(),
                'revoked_at' => null,
                'granted_by_subject_id' => $actorSubjectId,
                'revoked_by_subject_id' => null,
            ],
        );

        return $entitlement;
    }

    public static function revoke(string $clientId, User $user, ?string $actorSubjectId = null): void
    {
        self::query()
            ->where('client_id', $clientId)
            ->where('user_id', $user->getKey())
            ->whereNull('revoked_at')
            ->update([
                'revoked_at' => now(),
                'revoked_by_subject_id' => $actorSubjectId,
                'updated_at' => now(),
            ]);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'granted_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }
}
