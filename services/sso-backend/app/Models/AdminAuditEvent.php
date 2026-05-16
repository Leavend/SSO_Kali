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
        'signing_key_id',
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

    private static bool $allowPrune = false;

    public static function withPruneAllowed(callable $callback): mixed
    {
        $previous = self::$allowPrune;
        self::$allowPrune = true;
        try {
            return $callback();
        } finally {
            self::$allowPrune = $previous;
        }
    }

    protected static function booted(): void
    {
        self::updating(fn (): never => throw new RuntimeException('Admin audit events are immutable.'));
        self::deleting(function (): void {
            if (! self::$allowPrune) {
                throw new RuntimeException('Admin audit events are immutable.');
            }
        });
    }
}
