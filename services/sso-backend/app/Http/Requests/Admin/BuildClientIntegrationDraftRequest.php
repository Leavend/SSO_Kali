<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

final class BuildClientIntegrationDraftRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'appName' => ['sometimes', 'string', 'max:120'],
            'app_name' => ['sometimes', 'string', 'max:120'],
            'clientId' => ['sometimes', 'string', 'max:80'],
            'client_id' => ['sometimes', 'string', 'max:80'],
            'environment' => ['sometimes', 'string', 'in:live,development'],
            'clientType' => ['sometimes', 'string', 'in:public,confidential'],
            'client_type' => ['sometimes', 'string', 'in:public,confidential'],
            'appBaseUrl' => ['sometimes', 'string', 'max:255'],
            'app_base_url' => ['sometimes', 'string', 'max:255'],
            'callbackPath' => ['sometimes', 'string', 'max:255'],
            'callback_path' => ['sometimes', 'string', 'max:255'],
            'logoutPath' => ['sometimes', 'string', 'max:255'],
            'logout_path' => ['sometimes', 'string', 'max:255'],
            'ownerEmail' => ['sometimes', 'string', 'max:255'],
            'owner_email' => ['sometimes', 'string', 'max:255'],
            'provisioning' => ['sometimes', 'string', 'in:jit,scim'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function draftInput(): array
    {
        return $this->safe()->only([
            'appName',
            'app_name',
            'clientId',
            'client_id',
            'environment',
            'clientType',
            'client_type',
            'appBaseUrl',
            'app_base_url',
            'callbackPath',
            'callback_path',
            'logoutPath',
            'logout_path',
            'ownerEmail',
            'owner_email',
            'provisioning',
        ]);
    }
}
