<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

final class SyncManagedUserProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'email' => ['sometimes', 'email:rfc,dns', 'max:255'],
            'display_name' => ['sometimes', 'string', 'max:120'],
            'given_name' => ['sometimes', 'nullable', 'string', 'max:80'],
            'family_name' => ['sometimes', 'nullable', 'string', 'max:80'],
        ];
    }
}
