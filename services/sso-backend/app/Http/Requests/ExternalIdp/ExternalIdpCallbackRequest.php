<?php

declare(strict_types=1);

namespace App\Http\Requests\ExternalIdp;

use Illuminate\Foundation\Http\FormRequest;

final class ExternalIdpCallbackRequest extends FormRequest
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
            'state' => ['sometimes', 'nullable', 'string', 'max:255'],
            'code' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'error' => ['sometimes', 'nullable', 'string', 'max:255'],
            'error_description' => ['sometimes', 'nullable', 'string', 'max:2048'],
        ];
    }
}
