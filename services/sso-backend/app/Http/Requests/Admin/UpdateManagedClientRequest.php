<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

final class UpdateManagedClientRequest extends FormRequest
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
            'owner_email' => ['sometimes', 'email:rfc,dns', 'max:255'],
            'redirect_uris' => ['sometimes', 'array', 'min:1'],
            'redirect_uris.*' => ['url', 'starts_with:https://', 'max:2048'],
            'post_logout_redirect_uris' => ['sometimes', 'array'],
            'post_logout_redirect_uris.*' => ['url', 'starts_with:https://', 'max:2048'],
            'backchannel_logout_uri' => ['sometimes', 'nullable', 'url', 'starts_with:https://', 'max:2048'],
        ];
    }
}
