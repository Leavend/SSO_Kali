<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

final class SsoErrorMessageTemplate extends Model
{
    protected $fillable = [
        'error_code',
        'locale',
        'title',
        'message',
        'action_label',
        'action_url',
        'retry_allowed',
        'alternative_login_allowed',
        'is_enabled',
        'created_by',
        'updated_by',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'retry_allowed' => 'boolean',
            'alternative_login_allowed' => 'boolean',
            'is_enabled' => 'boolean',
        ];
    }
}
