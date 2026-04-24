<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use RuntimeException;

final class AdminAuditEvent extends Model
{
    public $timestamps = false;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'event_id',
        'action',
        'outcome',
        'taxonomy',
        'admin_subject_id',
        'admin_email',
        'admin_role',
        'method',
        'path',
        'ip_address',
        'reason',
        'context',
        'occurred_at',
        'previous_hash',
        'event_hash',
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
        self::updating(fn (): never => throw new RuntimeException('Admin audit events are immutable.'));
        self::deleting(fn (): never => throw new RuntimeException('Admin audit events are immutable.'));
    }
}
