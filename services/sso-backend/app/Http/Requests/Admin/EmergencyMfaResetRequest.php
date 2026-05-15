<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/**
 * BE-FR020-001 — Lost-factor reset must capture a justifying reason.
 *
 * The reason is recorded in the admin audit event and copied to the user
 * record so the user (and downstream notifications) can see why their
 * factor was reset. Length floor (8) is intentional: anything shorter is
 * presumed to be a pasted ticket id only, which we accept but require a
 * structured short summary alongside.
 */
final class EmergencyMfaResetRequest extends FormRequest
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
            'reason' => ['required', 'string', 'min:8', 'max:240'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'reason.required' => 'A justification is required to reset the user MFA.',
            'reason.min' => 'The justification must be at least 8 characters.',
            'reason.max' => 'The justification may not exceed 240 characters.',
        ];
    }
}
