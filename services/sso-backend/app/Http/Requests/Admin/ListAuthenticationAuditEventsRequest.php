<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ListAuthenticationAuditEventsRequest extends FormRequest
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
            'event_type' => ['sometimes', 'string', 'max:160'],
            'outcome' => ['sometimes', 'string', Rule::in(['failed', 'started', 'succeeded'])],
            'subject_id' => ['sometimes', 'string', 'max:160'],
            'client_id' => ['sometimes', 'string', 'max:160'],
            'session_id' => ['sometimes', 'string', 'max:160'],
            'request_id' => ['sometimes', 'string', 'max:160'],
            'error_code' => ['sometimes', 'string', 'max:160'],
            'from' => ['sometimes', 'date'],
            'to' => ['sometimes', 'date', 'after_or_equal:from'],
        ];
    }
}
