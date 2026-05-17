<?php

declare(strict_types=1);

namespace App\Http\Requests\DataSubject;

use App\Models\DataSubjectRequest;
use Illuminate\Foundation\Http\FormRequest;

final class StoreDataSubjectRequest extends FormRequest
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
            'type' => ['required', 'string', 'in:'.implode(',', DataSubjectRequest::TYPES)],
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }
}
