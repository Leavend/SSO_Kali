<?php

declare(strict_types=1);

namespace App\Http\Requests\DataSubject;

use Illuminate\Foundation\Http\FormRequest;

final class ListDataSubjectRequestsRequest extends FormRequest
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
            'status' => ['nullable', 'in:submitted,approved,rejected,fulfilled,cancelled,on_hold'],
            'type' => ['nullable', 'in:export,delete,anonymize'],
            'subject_id' => ['nullable', 'string', 'max:64'],
        ];
    }
}
