<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Support\Oidc\OidcScope;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class SyncClientScopesRequest extends FormRequest
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
            'scopes' => ['required', 'array', 'min:1'],
            'scopes.*' => ['string', Rule::in(OidcScope::names())],
        ];
    }
}
