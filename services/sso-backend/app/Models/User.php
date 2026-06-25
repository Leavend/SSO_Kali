<?php

declare(strict_types=1);

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Support\Identity\GovernmentIdentifier;
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
 * @property string|null $phone
 * @property Carbon|null $phone_verified_at
 * @property string|null $given_name
 * @property string|null $family_name
 * @property string $display_name
 * @property string $role
 * @property string $status
 * @property Carbon|null $disabled_at
 * @property string|null $disabled_reason
 * @property Carbon|null $locked_at
 * @property Carbon|null $locked_until
 * @property string|null $locked_reason
 * @property string|null $locked_by_subject_id
 * @property int $lock_count
 * @property bool $local_account_enabled
 * @property Carbon|null $profile_synced_at
 * @property Carbon|null $password_changed_at
 * @property bool $mfa_reset_required
 * @property Carbon|null $mfa_reset_at
 * @property string|null $mfa_reset_reason
 * @property int|null $mfa_reset_by_user_id
 * @property string|null $password_reset_token_hash
 * @property Carbon|null $password_reset_token_expires_at
 * @property Carbon|null $email_verified_at
 * @property Carbon|null $last_login_at
 * @property string|null $nik
 * @property string|null $nik_hash
 * @property string|null $nip
 * @property string|null $nip_hash
 * @property string|null $nisn
 * @property string|null $nisn_hash
 * @property Carbon|null $birth_date
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
        'phone',
        'phone_verified_at',
        'password',
        'password_changed_at',
        'mfa_reset_required',
        'mfa_reset_at',
        'mfa_reset_reason',
        'mfa_reset_by_user_id',
        'given_name',
        'family_name',
        'display_name',
        'role',
        'status',
        'disabled_at',
        'disabled_reason',
        'locked_at',
        'locked_until',
        'locked_reason',
        'locked_by_subject_id',
        'lock_count',
        'local_account_enabled',
        'mfa_mandatory',
        'profile_synced_at',
        'password_reset_token_hash',
        'password_reset_token_expires_at',
        'email_verified_at',
        'last_login_at',
        'nik',
        'nip',
        'nisn',
        'birth_date',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'subject_uuid',
        'nik',
        'nik_hash',
        'nip',
        'nip_hash',
        'nisn',
        'nisn_hash',
        'birth_date',
    ];

    protected static function booted(): void
    {
        static::saving(static function (User $user): void {
            if ($user->isDirty('email')) {
                $user->email = mb_strtolower(trim((string) $user->email));
            }

            if ($user->isDirty('nip')) {
                $user->nip = GovernmentIdentifier::nip($user->nip);
                $user->nip_hash = $user->nip === null || $user->nip === ''
                    ? null
                    : GovernmentIdentifier::hashNip($user->nip);
            }

            if ($user->isDirty('nisn')) {
                $user->nisn = GovernmentIdentifier::nisn($user->nisn);
                $user->nisn_hash = $user->nisn === null || $user->nisn === ''
                    ? null
                    : GovernmentIdentifier::hashNisn($user->nisn);
            }

            if ($user->isDirty('nik')) {
                $user->nik = GovernmentIdentifier::nik($user->nik);

                if ($user->nik === null || $user->nik === '') {
                    $user->nik_hash = null;
                } else {
                    $user->nik_hash = GovernmentIdentifier::hashNik($user->nik);
                }
            }
        });
    }

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
            'phone_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'disabled_at' => 'datetime',
            'locked_at' => 'datetime',
            'locked_until' => 'datetime',
            'lock_count' => 'integer',
            'local_account_enabled' => 'boolean',
            'mfa_mandatory' => 'boolean',
            'profile_synced_at' => 'datetime',
            'password_changed_at' => 'datetime',
            'mfa_reset_required' => 'boolean',
            'mfa_reset_at' => 'datetime',
            'password_reset_token_expires_at' => 'datetime',
            'password' => 'hashed',
            'nik' => 'encrypted',
            'nip' => 'encrypted',
            'nisn' => 'encrypted',
            'birth_date' => 'date',
        ];
    }

    public function isLocked(): bool
    {
        return $this->locked_at !== null
            && ($this->locked_until === null || $this->locked_until->isFuture());
    }

    public function getEffectiveStatusAttribute(): string
    {
        if (in_array($this->status, ['disabled', 'deactivated'], true)) {
            return $this->status;
        }

        return $this->isLocked() ? 'locked' : ($this->status ?: 'active');
    }
}
