<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $request_id
 * @property string $subject_id
 * @property string $type
 * @property string $status
 * @property string|null $reason
 * @property array<string,mixed>|null $context
 * @property string|null $reviewer_subject_id
 * @property string|null $reviewer_notes
 * @property Carbon $submitted_at
 * @property Carbon|null $reviewed_at
 * @property Carbon|null $fulfilled_at
 * @property Carbon|null $sla_due_at
 * @property Carbon|null $expires_at
 */
final class DataSubjectRequest extends Model
{
    use HasFactory;

    public const TYPES = ['export', 'delete', 'anonymize'];

    public const STATUSES = ['submitted', 'approved', 'rejected', 'fulfilled', 'cancelled'];

    /** @var list<string> */
    protected $fillable = [
        'request_id',
        'subject_id',
        'type',
        'status',
        'reason',
        'context',
        'reviewer_subject_id',
        'reviewer_notes',
        'submitted_at',
        'reviewed_at',
        'fulfilled_at',
        'sla_due_at',
        'expires_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'context' => 'array',
            'submitted_at' => 'datetime',
            'reviewed_at' => 'datetime',
            'fulfilled_at' => 'datetime',
            'sla_due_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }
}
