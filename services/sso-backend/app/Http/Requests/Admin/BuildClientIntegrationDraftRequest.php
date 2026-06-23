<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Support\Oidc\ClientCategory;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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
            'appBaseUrl' => ['sometimes', 'url', $this->webUrlScheme(), 'max:255'],
            'app_base_url' => ['sometimes', 'url', $this->webUrlScheme(), 'max:255'],
            'callbackPath' => ['sometimes', 'string', 'max:255'],
            'callback_path' => ['sometimes', 'string', 'max:255'],
            'logoutPath' => ['sometimes', 'string', 'max:255'],
            'logout_path' => ['sometimes', 'string', 'max:255'],
            'ownerEmail' => ['sometimes', 'string', 'max:255'],
            'owner_email' => ['sometimes', 'string', 'max:255'],
            'provisioning' => ['sometimes', 'string', 'in:jit,scim'],
            'allowedScopes' => ['sometimes', 'array', 'min:1'],
            'allowedScopes.*' => ['string', 'max:80'],
            'allowed_scopes' => ['sometimes', 'array', 'min:1'],
            'allowed_scopes.*' => ['string', 'max:80'],
            'category' => ['sometimes', 'string', Rule::in(ClientCategory::values())],
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
            'allowedScopes',
            'allowed_scopes',
            'category',
        ]);
    }

    private function webUrlScheme(): \Closure
    {
        return static function (string $attribute, mixed $value, \Closure $fail): void {
            $scheme = is_string($value) ? parse_url($value, PHP_URL_SCHEME) : null;

            if (! is_string($scheme) || ! in_array(strtolower($scheme), ['http', 'https'], true)) {
                $fail('The '.$attribute.' field must be an HTTP or HTTPS URL.');
            }
        };
    }
}
