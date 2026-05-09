<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\ExternalSubjectLinkFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $user_id
 * @property int $external_identity_provider_id
 * @property string $provider_key
 * @property string $issuer
 * @property string $external_subject
 * @property string|null $email
 * @property Carbon|null $email_verified_at
 * @property string|null $display_name
 * @property array<string, mixed>|null $last_claims_snapshot
 * @property Carbon|null $last_login_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
final class ExternalSubjectLink extends Model
{
    /** @use HasFactory<ExternalSubjectLinkFactory> */
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'external_identity_provider_id',
        'provider_key',
        'issuer',
        'external_subject',
        'email',
        'email_verified_at',
        'display_name',
        'last_claims_snapshot',
        'last_login_at',
    ];

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<ExternalIdentityProvider, $this>
     */
    public function provider(): BelongsTo
    {
        return $this->belongsTo(ExternalIdentityProvider::class, 'external_identity_provider_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_claims_snapshot' => 'array',
            'last_login_at' => 'datetime',
        ];
    }
}
