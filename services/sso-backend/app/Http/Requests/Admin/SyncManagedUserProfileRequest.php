<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Models\User;
use App\Support\Identity\GovernmentIdentifier;
use App\Support\Responses\AdminApiResponse;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

final class SyncManagedUserProfileRequest extends FormRequest
{
    private ?int $targetUserId = null;

    private bool $targetUserResolved = false;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        $userId = $this->resolvedTargetUserId();

        return [
            'email' => ['sometimes', 'email:rfc', 'max:255', Rule::unique('users', 'email')->ignore($userId)],
            'display_name' => ['sometimes', 'string', 'max:120'],
            'given_name' => ['sometimes', 'nullable', 'string', 'max:80'],
            'family_name' => ['sometimes', 'nullable', 'string', 'max:80'],
            'nik' => ['sometimes', 'nullable', 'string', 'regex:/^[0-9]{16}$/', $this->uniqueIdentifier('nik', $userId)],
            'nip' => ['sometimes', 'nullable', 'string', 'regex:/^[0-9]{18}$/', $this->uniqueIdentifier('nip', $userId)],
            'nisn' => ['sometimes', 'nullable', 'string', 'regex:/^[0-9]{10}$/', $this->uniqueIdentifier('nisn', $userId)],
            'birth_date' => ['sometimes', 'nullable', 'date', 'date_format:Y-m-d'],
        ];
    }

    private function resolvedTargetUserId(): int
    {
        if (! $this->targetUserResolved) {
            $this->targetUserResolved = true;
            $userId = User::query()
                ->where('subject_id', (string) $this->route('subjectId'))
                ->value('id');
            $this->targetUserId = is_numeric($userId) ? (int) $userId : null;
        }

        if ($this->targetUserId === null) {
            throw new HttpResponseException(
                AdminApiResponse::error('not_found', 'User not found.', 404)
            );
        }

        return $this->targetUserId;
    }

    protected function prepareForValidation(): void
    {
        $canonical = [];

        if ($this->has('email')) {
            $canonical['email'] = mb_strtolower(trim($this->string('email')->toString()));
        }

        if ($this->has('nik')) {
            $canonical['nik'] = GovernmentIdentifier::canonical('nik', $this->string('nik')->toString());
        }

        if ($this->has('nip')) {
            $canonical['nip'] = GovernmentIdentifier::canonical('nip', $this->string('nip')->toString());
        }

        if ($this->has('nisn')) {
            $canonical['nisn'] = GovernmentIdentifier::canonical('nisn', $this->string('nisn')->toString());
        }

        if ($canonical !== []) {
            $this->merge($canonical);
        }
    }

    private function uniqueIdentifier(string $type, mixed $userId): \Closure
    {
        return static function (string $attribute, mixed $value, \Closure $fail) use ($type, $userId): void {
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

            $exists = User::query()
                ->where($type.'_hash', $hash)
                ->when($userId !== null, fn ($query) => $query->whereKeyNot($userId))
                ->exists();

            if ($exists) {
                $fail('The '.$attribute.' has already been taken.');
            }
        };
    }
}
