<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class SyncUserRolesRequest extends FormRequest
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
            'role_slugs' => ['required', 'array', 'size:1'],
            'role_slugs.*' => ['string', Rule::exists('roles', 'slug')],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'role_slugs.size' => 'Satu akun hanya boleh memiliki satu peran.',
        ];
    }
}
