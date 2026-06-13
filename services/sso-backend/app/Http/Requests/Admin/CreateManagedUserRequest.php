<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Models\User;
use App\Rules\StrongPassword;
use App\Services\Admin\AdminAuditLogger;
use Illuminate\Contracts\Validation\Validator;
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
            'email' => ['required', 'email:rfc', 'max:255', 'unique:users,email'],
            'display_name' => ['required', 'string', 'max:120'],
            'given_name' => ['nullable', 'string', 'max:80'],
            'family_name' => ['nullable', 'string', 'max:80'],
            'role' => ['required', 'string', Rule::in(['admin', 'user'])],
            'password' => ['nullable', 'string', new StrongPassword],
            'local_account_enabled' => ['sometimes', 'boolean'],
        ];
    }

    protected function failedValidation(Validator $validator): void
    {
        $logger = app(AdminAuditLogger::class);
        $admin = $this->attributes->get('admin_user');
        $logger->denied(
            action: 'create_managed_user',
            request: $this,
            admin: $admin instanceof User ? $admin : null,
            reason: 'Validation failed.',
            context: [
                'errors' => $validator->errors()->toArray(),
            ],
            taxonomy: 'user_lifecycle'
        );

        parent::failedValidation($validator);
    }
}
