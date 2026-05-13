<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * FR-018: MFA credential storage.
 *
 * Stores encrypted TOTP secrets. The `verified_at` timestamp
 * distinguishes pending enrollments from confirmed credentials.
 *
 * @property int $id
 * @property int $user_id
 * @property string $method
 * @property string $secret
 * @property string $algorithm
 * @property int $digits
 * @property int $period
 * @property Carbon|null $verified_at
 * @property Carbon|null $last_used_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
final class MfaCredential extends Model
{
    protected $table = 'mfa_credentials';

    protected $fillable = [
        'user_id',
        'method',
        'secret',
        'algorithm',
        'digits',
        'period',
        'verified_at',
        'last_used_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'secret' => 'encrypted',
            'digits' => 'integer',
            'period' => 'integer',
            'verified_at' => 'datetime',
            'last_used_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, self>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeVerified(Builder $query): Builder
    {
        return $query->whereNotNull('verified_at');
    }

    /**
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeForUser(Builder $query, int $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    /**
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeTotp(Builder $query): Builder
    {
        return $query->where('method', 'totp');
    }

    public function isVerified(): bool
    {
        return $this->verified_at !== null;
    }
}
