<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $data_subject_request_id
 * @property string $type
 * @property bool $dry_run
 * @property array<string, mixed> $payload
 * @property string $hash
 * @property Carbon|null $expires_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
final class DsrFulfillmentArtifact extends Model
{
    /** @var list<string> */
    protected $fillable = [
        'data_subject_request_id',
        'type',
        'dry_run',
        'payload',
        'hash',
        'expires_at',
    ];

    /**
     * @return BelongsTo<DataSubjectRequest, $this>
     */
    public function request(): BelongsTo
    {
        return $this->belongsTo(DataSubjectRequest::class, 'data_subject_request_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'dry_run' => 'boolean',
            'payload' => 'encrypted:array',
            'expires_at' => 'datetime',
        ];
    }
}
