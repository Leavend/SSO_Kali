<?php

declare(strict_types=1);

namespace App\Http\Requests\Profile;

use Illuminate\Foundation\Http\FormRequest;

final class RequestPhoneChangeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'new_phone' => ['required', 'string', 'regex:/^\\+[1-9][0-9]{7,14}$/'],
            'current_password' => ['required', 'string', 'max:200'],
        ];
    }
}
