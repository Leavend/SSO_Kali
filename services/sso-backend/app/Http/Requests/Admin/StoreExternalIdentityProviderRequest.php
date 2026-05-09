<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

final class StoreExternalIdentityProviderRequest extends FormRequest
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
            'provider_key' => ['required', 'string', 'regex:/^[a-z0-9_-]+$/', 'max:80'],
            'display_name' => ['required', 'string', 'max:120'],
            'issuer' => ['required', 'url', 'starts_with:https://', 'max:2048'],
            'metadata_url' => ['required', 'url', 'starts_with:https://', 'max:2048'],
            'client_id' => ['required', 'string', 'max:255'],
            'client_secret' => ['nullable', 'string', 'max:4096'],
            'allowed_algorithms' => ['sometimes', 'array', 'min:1'],
            'allowed_algorithms.*' => ['string', 'in:RS256,RS384,RS512,ES256,ES384,ES512'],
            'scopes' => ['sometimes', 'array', 'min:1'],
            'scopes.*' => ['string', 'regex:/^[a-zA-Z0-9:._-]+$/', 'max:80'],
            'priority' => ['sometimes', 'integer', 'min:1', 'max:1000'],
            'enabled' => ['sometimes', 'boolean'],
            'is_backup' => ['sometimes', 'boolean'],
        ];
    }
}
