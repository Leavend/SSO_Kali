<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $device_hash
 * @property string $session_id
 * @property int $user_id
 * @property string $account_id
 * @property Carbon $added_at
 * @property Carbon|null $last_seen_at
 */
final class DeviceSession extends Model
{
    protected $fillable = [
        'device_hash',
        'session_id',
        'user_id',
        'account_id',
        'added_at',
        'last_seen_at',
    ];

    protected function casts(): array
    {
        return [
            'added_at' => 'datetime',
            'last_seen_at' => 'datetime',
        ];
    }
}
