<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $cidr
 * @property string $mode
 * @property string|null $reason
 * @property Carbon|null $expires_at
 * @property string|null $actor_subject_id
 * @property Carbon $created_at
 * @property Carbon $updated_at
 *
 * @method static Builder|static active()
 */
final class IpAccessRule extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'cidr',
        'mode',
        'reason',
        'expires_at',
        'actor_subject_id',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
        ];
    }

    /**
     * @param  Builder<static>  $query
     * @return Builder<static>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where(function (Builder $q): void {
            $q->whereNull('expires_at')
                ->orWhere('expires_at', '>', now());
        });
    }
}
