<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use RuntimeException;

/**
 * @property string $event_id
 * @property string $event_type
 * @property string $outcome
 * @property string|null $subject_id
 * @property string|null $email
 * @property string|null $client_id
 * @property string|null $session_id
 * @property string|null $ip_address
 * @property string|null $user_agent
 * @property string|null $error_code
 * @property string|null $request_id
 * @property array<string, mixed>|null $context
 * @property Carbon $occurred_at
 */
final class AuthenticationAuditEvent extends Model
{
    public $timestamps = false;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'event_id',
        'event_type',
        'outcome',
        'subject_id',
        'email',
        'client_id',
        'session_id',
        'ip_address',
        'user_agent',
        'error_code',
        'request_id',
        'context',
        'occurred_at',
        'created_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'context' => 'array',
            'occurred_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        self::updating(fn (): never => throw new RuntimeException('Authentication audit events are immutable.'));
        self::deleting(fn (): never => throw new RuntimeException('Authentication audit events are immutable.'));
    }
}
