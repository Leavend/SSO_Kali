<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Support\Oidc\ClientCategory;
use App\Support\Oidc\TrustedRedirectUriPolicy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpdateManagedClientRequest extends FormRequest
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
        // Resolve the rule once so the trusted-origin set is computed a single
        // time and shared across every redirect + post-logout URI in the request.
        $trustedRedirectUri = $this->trustedRedirectUri();

        return [
            'display_name' => ['sometimes', 'string', 'max:120'],
            'owner_email' => ['sometimes', 'email:rfc', 'max:255'],
            'redirect_uris' => ['sometimes', 'array', 'min:1'],
            'redirect_uris.*' => ['url', 'starts_with:https://', 'max:2048', $trustedRedirectUri],
            'post_logout_redirect_uris' => ['sometimes', 'array'],
            'post_logout_redirect_uris.*' => ['url', 'starts_with:https://', 'max:2048', $trustedRedirectUri],
            'backchannel_logout_uri' => ['sometimes', 'nullable', 'url', 'starts_with:https://', 'max:2048'],
            'category' => ['sometimes', 'string', Rule::in(ClientCategory::values())],
            // Extra HTTPS origins this client may redirect to beyond app_base_url
            // (e.g. a dedicated auth host). Persisted into the registration
            // contract so the redirect-URI trust check has a write path.
            'trusted_redirect_origins' => ['sometimes', 'array'],
            'trusted_redirect_origins.*' => ['string', 'url', 'starts_with:https://', 'max:2048'],
            // Opt-in flag that allow-lists this client's origin for credentialed
            // cross-origin widget (/widget/*) calls.
            'widget_cors_trusted' => ['sometimes', 'boolean'],
        ];
    }

    private function trustedRedirectUri(): \Closure
    {
        $policy = app(TrustedRedirectUriPolicy::class);
        $clientId = (string) $this->route('clientId');
        $trustedOrigins = $policy->trustedOriginsFor($clientId, $this->submittedTrustedOrigins());

        return function (string $attribute, mixed $value, \Closure $fail) use ($policy, $trustedOrigins): void {
            if (is_string($value) && ! $policy->permits($value, $trustedOrigins)) {
                $fail('The '.$attribute.' origin is not trusted for this client.');
            }
        };
    }

    /**
     * Trusted origins submitted in this same request, so a redirect URI and the
     * origins that authorize it can be saved together.
     *
     * @return list<string>
     */
    private function submittedTrustedOrigins(): array
    {
        $origins = $this->input('trusted_redirect_origins', []);

        return is_array($origins)
            ? array_values(array_filter($origins, 'is_string'))
            : [];
    }
}
