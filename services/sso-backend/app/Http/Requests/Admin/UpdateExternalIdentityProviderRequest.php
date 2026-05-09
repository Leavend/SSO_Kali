<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

final class UpdateExternalIdentityProviderRequest extends FormRequest
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
            'display_name' => ['sometimes', 'string', 'max:120'],
            'metadata_url' => ['sometimes', 'url', 'starts_with:https://', 'max:2048'],
            'client_id' => ['sometimes', 'string', 'max:255'],
            'client_secret' => ['sometimes', 'nullable', 'string', 'max:4096'],
            'allowed_algorithms' => ['sometimes', 'array', 'min:1'],
            'allowed_algorithms.*' => ['string', 'in:RS256,RS384,RS512,ES256,ES384,ES512'],
            'scopes' => ['sometimes', 'array', 'min:1'],
            'scopes.*' => ['string', 'regex:/^[a-zA-Z0-9:._-]+$/', 'max:80'],
            'priority' => ['sometimes', 'integer', 'min:1', 'max:1000'],
            'enabled' => ['sometimes', 'boolean'],
            'is_backup' => ['sometimes', 'boolean'],
            'tls_validation_enabled' => ['sometimes', 'boolean'],
            'signature_validation_enabled' => ['sometimes', 'boolean'],
        ];
    }
}
