<?php

declare(strict_types=1);

namespace App\Http\Requests\DataSubject;

use Illuminate\Foundation\Http\FormRequest;

final class ReviewDataSubjectRequestRequest extends FormRequest
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
            'decision' => ['required', 'in:approved,rejected'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
