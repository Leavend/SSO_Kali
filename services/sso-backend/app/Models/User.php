<?php

declare(strict_types=1);

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Laravel\Passport\Contracts\OAuthenticatable;
use Laravel\Passport\HasApiTokens;

/**
 * @property int $id
 * @property string $subject_id
 * @property string|null $subject_uuid
 * @property string $email
 * @property string|null $given_name
 * @property string|null $family_name
 * @property string $display_name
 * @property string $role
 * @property string $status
 * @property Carbon|null $disabled_at
 * @property string|null $disabled_reason
 * @property bool $local_account_enabled
 * @property Carbon|null $profile_synced_at
 * @property Carbon|null $password_changed_at
 * @property string|null $password_reset_token_hash
 * @property Carbon|null $password_reset_token_expires_at
 * @property Carbon|null $email_verified_at
 * @property Carbon|null $last_login_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class User extends Authenticatable implements OAuthenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'subject_id',
        'subject_uuid',
        'email',
        'password',
        'password_changed_at',
        'given_name',
        'family_name',
        'display_name',
        'role',
        'status',
        'disabled_at',
        'disabled_reason',
        'local_account_enabled',
        'profile_synced_at',
        'password_reset_token_hash',
        'password_reset_token_expires_at',
        'email_verified_at',
        'last_login_at',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = ['password', 'remember_token', 'subject_uuid'];

    /**
     * @return BelongsToMany<Role, $this>
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class)->withTimestamps();
    }

    /**
     * @return HasMany<ExternalSubjectLink, $this>
     */
    public function externalSubjectLinks(): HasMany
    {
        return $this->hasMany(ExternalSubjectLink::class);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'disabled_at' => 'datetime',
            'local_account_enabled' => 'boolean',
            'profile_synced_at' => 'datetime',
            'password_changed_at' => 'datetime',
            'password_reset_token_expires_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
