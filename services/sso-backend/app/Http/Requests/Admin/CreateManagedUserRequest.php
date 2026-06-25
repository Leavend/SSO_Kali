<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Models\User;
use App\Rules\StrongPassword;
use App\Services\Admin\AdminAuditLogger;
use App\Support\Identity\GovernmentIdentifier;
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
            'role' => ['required', 'string', Rule::in(['admin', 'user', 'pegawai'])],
            'password' => ['nullable', 'string', new StrongPassword],
            'local_account_enabled' => ['sometimes', 'boolean'],
            'nik' => ['nullable', 'string', 'regex:/^[0-9]{16}$/', $this->uniqueIdentifier('nik')],
            'nip' => ['nullable', 'string', 'regex:/^[0-9]{18}$/', $this->uniqueIdentifier('nip')],
            'nisn' => ['nullable', 'string', 'regex:/^[0-9]{10}$/', $this->uniqueIdentifier('nisn')],
            'birth_date' => ['nullable', 'date', 'date_format:Y-m-d'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => mb_strtolower(trim($this->string('email')->toString())),
            'nik' => GovernmentIdentifier::canonical('nik', $this->string('nik')->toString()),
            'nip' => GovernmentIdentifier::canonical('nip', $this->string('nip')->toString()),
            'nisn' => GovernmentIdentifier::canonical('nisn', $this->string('nisn')->toString()),
        ]);
    }

    private function uniqueIdentifier(string $type): \Closure
    {
        return static function (string $attribute, mixed $value, \Closure $fail) use ($type): void {
            $canonical = is_string($value) ? match ($type) {
                'nik' => GovernmentIdentifier::nik($value),
                'nip' => GovernmentIdentifier::nip($value),
                'nisn' => GovernmentIdentifier::nisn($value),
                default => null,
            } : null;

            if ($canonical === null || $canonical === '') {
                return;
            }

            $hash = match ($type) {
                'nik' => GovernmentIdentifier::optionalNikHash($canonical),
                'nip' => GovernmentIdentifier::optionalNipHash($canonical),
                'nisn' => GovernmentIdentifier::optionalNisnHash($canonical),
                default => null,
            };

            if ($hash === null) {
                $fail('Government identifier hashing is not configured.');

                return;
            }

            if (User::query()->where($type.'_hash', $hash)->exists()) {
                $fail('The '.$attribute.' has already been taken.');
            }
        };
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
