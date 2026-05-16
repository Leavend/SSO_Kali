<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $category
 * @property int $version
 * @property string $status
 * @property array<string, mixed> $payload
 * @property Carbon|null $effective_at
 * @property string|null $actor_subject_id
 * @property string|null $reason
 * @property Carbon|null $activated_at
 * @property Carbon|null $superseded_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
final class SecurityPolicy extends Model
{
    /**
     * @var list<string>
     */
    public const CATEGORIES = [
        'password',
        'mfa',
        'session',
        'lockout',
    ];

    public const STATUS_DRAFT = 'draft';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_SUPERSEDED = 'superseded';

    public const STATUS_ROLLED_BACK = 'rolled_back';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'category',
        'version',
        'status',
        'payload',
        'effective_at',
        'actor_subject_id',
        'reason',
        'activated_at',
        'superseded_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'effective_at' => 'datetime',
            'activated_at' => 'datetime',
            'superseded_at' => 'datetime',
        ];
    }
}
