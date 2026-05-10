<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpsertSsoErrorTemplateRequest extends FormRequest
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
            'locale' => ['required', 'string', Rule::in(['id', 'en'])],
            'title' => ['required', 'string', 'max:120'],
            'message' => ['required', 'string', 'max:500'],
            'action_label' => ['required', 'string', 'max:80'],
            'action_url' => ['nullable', 'url:https', 'max:500'],
            'retry_allowed' => ['required', 'boolean'],
            'alternative_login_allowed' => ['required', 'boolean'],
            'is_enabled' => ['required', 'boolean'],
        ];
    }
}
