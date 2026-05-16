<?php

declare(strict_types=1);

namespace App\Http\Requests\DataSubject;

use Illuminate\Foundation\Http\FormRequest;

final class FulfillDataSubjectRequestRequest extends FormRequest
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
            'dry_run' => ['nullable', 'boolean'],
        ];
    }
}
