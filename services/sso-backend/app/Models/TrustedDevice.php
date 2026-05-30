<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $user_id
 * @property string $subject_id
 * @property string $fingerprint
 * @property string|null $label
 * @property string|null $ip_address
 * @property string|null $user_agent
 * @property Carbon $trusted_at
 * @property Carbon|null $last_seen_at
 * @property Carbon|null $revoked_at
 */
final class TrustedDevice extends Model
{
    protected $fillable = [
        'user_id',
        'subject_id',
        'fingerprint',
        'label',
        'ip_address',
        'user_agent',
        'trusted_at',
        'last_seen_at',
        'revoked_at',
    ];

    protected function casts(): array
    {
        return [
            'trusted_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }
}
