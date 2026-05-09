<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;

/**
 * @property string $provider_key
 * @property string $display_name
 * @property string $issuer
 * @property string $metadata_url
 * @property string $client_id
 * @property string|null $client_secret_encrypted
 * @property string|null $authorization_endpoint
 * @property string|null $token_endpoint
 * @property string|null $userinfo_endpoint
 * @property string|null $jwks_uri
 * @property array<int, string> $allowed_algorithms
 * @property array<int, string> $scopes
 * @property int $priority
 * @property bool $enabled
 * @property bool $is_backup
 * @property bool $tls_validation_enabled
 * @property bool $signature_validation_enabled
 * @property string|null $created_by_subject_id
 * @property string|null $updated_by_subject_id
 * @property Carbon|null $last_discovered_at
 * @property Carbon|null $last_health_checked_at
 * @property string $health_status
 */
final class ExternalIdentityProvider extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'provider_key',
        'display_name',
        'issuer',
        'metadata_url',
        'client_id',
        'client_secret_encrypted',
        'authorization_endpoint',
        'token_endpoint',
        'userinfo_endpoint',
        'jwks_uri',
        'allowed_algorithms',
        'scopes',
        'priority',
        'enabled',
        'is_backup',
        'tls_validation_enabled',
        'signature_validation_enabled',
        'created_by_subject_id',
        'updated_by_subject_id',
        'last_discovered_at',
        'last_health_checked_at',
        'health_status',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'allowed_algorithms' => 'array',
            'scopes' => 'array',
            'priority' => 'integer',
            'enabled' => 'boolean',
            'is_backup' => 'boolean',
            'tls_validation_enabled' => 'boolean',
            'signature_validation_enabled' => 'boolean',
            'last_discovered_at' => 'datetime',
            'last_health_checked_at' => 'datetime',
        ];
    }

    /**
     * @return HasOne<ExternalIdpClaimMapping, $this>
     */
    public function claimMapping(): HasOne
    {
        return $this->hasOne(ExternalIdpClaimMapping::class, 'external_identity_provider_id');
    }
}
