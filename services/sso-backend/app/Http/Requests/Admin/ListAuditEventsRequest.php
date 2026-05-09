<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ListAuditEventsRequest extends FormRequest
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
            'limit' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'cursor' => ['sometimes', 'string', 'max:512'],
            'action' => ['sometimes', 'string', 'max:120'],
            'outcome' => ['sometimes', 'string', Rule::in(['denied', 'failed', 'succeeded'])],
            'taxonomy' => ['sometimes', 'string', 'max:120'],
            'admin_subject_id' => ['sometimes', 'string', 'max:160'],
            'from' => ['sometimes', 'date'],
            'to' => ['sometimes', 'date', 'after_or_equal:from'],
        ];
    }
}
