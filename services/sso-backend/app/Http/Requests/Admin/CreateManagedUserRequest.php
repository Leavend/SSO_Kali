<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class CreateManagedUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'email:rfc,dns', 'max:255', 'unique:users,email'],
            'display_name' => ['required', 'string', 'max:120'],
            'given_name' => ['nullable', 'string', 'max:80'],
            'family_name' => ['nullable', 'string', 'max:80'],
            'role' => ['required', 'string', Rule::in(['admin', 'user'])],
            'password' => ['nullable', 'string', 'min:12', 'max:128'],
            'local_account_enabled' => ['sometimes', 'boolean'],
        ];
    }
}
