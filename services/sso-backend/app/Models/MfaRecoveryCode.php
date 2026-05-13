<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * FR-018: MFA recovery code storage.
 *
 * Each code is stored as a bcrypt hash. Once used, `used_at` is set
 * and the code cannot be reused.
 *
 * @property int $id
 * @property int $user_id
 * @property string $code_hash
 * @property Carbon|null $used_at
 * @property Carbon $created_at
 */
final class MfaRecoveryCode extends Model
{
    public $timestamps = false;

    protected $table = 'mfa_recovery_codes';

    protected $fillable = [
        'user_id',
        'code_hash',
        'used_at',
        'created_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'used_at' => 'datetime',
            'created_at' => 'datetime',
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
    public function scopeUnused(Builder $query): Builder
    {
        return $query->whereNull('used_at');
    }

    /**
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeForUser(Builder $query, int $userId): Builder
    {
        return $query->where('user_id', $userId);
    }
}
