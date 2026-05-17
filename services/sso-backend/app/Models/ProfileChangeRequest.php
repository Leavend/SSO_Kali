<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $user_id
 * @property string $type
 * @property string $target_value
 * @property string|null $token_hash
 * @property string|null $otp_hash
 * @property Carbon $expires_at
 * @property Carbon|null $consumed_at
 * @property string|null $ip_address
 * @property string|null $user_agent
 */
final class ProfileChangeRequest extends Model
{
    public const TYPE_EMAIL = 'email';

    public const TYPE_PHONE = 'phone';

    /** @var list<string> */
    protected $fillable = [
        'user_id',
        'type',
        'target_value',
        'token_hash',
        'otp_hash',
        'expires_at',
        'consumed_at',
        'ip_address',
        'user_agent',
    ];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'consumed_at' => 'datetime',
        ];
    }
}
