<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $session_id
 * @property int $user_id
 * @property string $subject_id
 * @property string|null $ip_address
 * @property string|null $user_agent
 * @property Carbon $authenticated_at
 * @property Carbon|null $last_seen_at
 * @property Carbon $expires_at
 * @property Carbon|null $revoked_at
 */
final class SsoSession extends Model
{
    protected $fillable = [
        'session_id',
        'user_id',
        'subject_id',
        'ip_address',
        'user_agent',
        'authenticated_at',
        'last_seen_at',
        'expires_at',
        'revoked_at',
    ];

    protected function casts(): array
    {
        return [
            'authenticated_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'expires_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }
}
