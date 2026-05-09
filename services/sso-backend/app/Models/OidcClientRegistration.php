<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $client_id
 * @property string $display_name
 * @property string $type
 * @property string $environment
 * @property string $app_base_url
 * @property array<int, string>|null $redirect_uris
 * @property array<int, string>|null $post_logout_redirect_uris
 * @property array<int, string>|null $allowed_scopes
 * @property string|null $backchannel_logout_uri
 * @property string|null $secret_hash
 * @property string $owner_email
 * @property string $provisioning
 * @property array<string, mixed>|null $contract
 * @property string $status
 * @property Carbon|null $activated_at
 * @property Carbon|null $disabled_at
 */
final class OidcClientRegistration extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'client_id',
        'display_name',
        'type',
        'environment',
        'app_base_url',
        'redirect_uris',
        'post_logout_redirect_uris',
        'allowed_scopes',
        'backchannel_logout_uri',
        'secret_hash',
        'owner_email',
        'provisioning',
        'contract',
        'status',
        'staged_by_subject_id',
        'staged_by_email',
        'activated_by_subject_id',
        'activated_by_email',
        'activated_at',
        'disabled_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'redirect_uris' => 'array',
            'post_logout_redirect_uris' => 'array',
            'allowed_scopes' => 'array',
            'contract' => 'array',
            'activated_at' => 'datetime',
            'disabled_at' => 'datetime',
        ];
    }
}
