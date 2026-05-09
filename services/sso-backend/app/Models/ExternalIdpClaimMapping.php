<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $external_identity_provider_id
 * @property string $provider_key
 * @property array<int, string> $subject_paths
 * @property array<int, string> $email_paths
 * @property array<int, string> $name_paths
 * @property array<int, string> $username_paths
 * @property array<int, string> $required_paths
 * @property bool $require_verified_email
 * @property bool $enabled
 */
final class ExternalIdpClaimMapping extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'external_identity_provider_id',
        'provider_key',
        'subject_paths',
        'email_paths',
        'name_paths',
        'username_paths',
        'required_paths',
        'require_verified_email',
        'enabled',
        'created_by_subject_id',
        'updated_by_subject_id',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'subject_paths' => 'array',
            'email_paths' => 'array',
            'name_paths' => 'array',
            'username_paths' => 'array',
            'required_paths' => 'array',
            'require_verified_email' => 'boolean',
            'enabled' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<ExternalIdentityProvider, $this>
     */
    public function provider(): BelongsTo
    {
        return $this->belongsTo(ExternalIdentityProvider::class, 'external_identity_provider_id');
    }
}
