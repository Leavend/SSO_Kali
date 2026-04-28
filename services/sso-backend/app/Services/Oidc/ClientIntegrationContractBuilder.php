<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Oidc\ClientIntegrationDraft;

final class ClientIntegrationContractBuilder
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
        private readonly ClientProvisioningReadinessBuilder $readiness,
    ) {}

    /**
     * @param  array<string, mixed>  $input
     */
    public function draftFrom(array $input): ClientIntegrationDraft
    {
        return new ClientIntegrationDraft(
            appName: $this->field($input, 'appName', 'app_name'),
            clientId: $this->field($input, 'clientId', 'client_id'),
            environment: $this->option($input, 'environment', 'development'),
            clientType: $this->option($input, 'clientType', 'public'),
            appBaseUrl: $this->field($input, 'appBaseUrl', 'app_base_url'),
            callbackPath: $this->field($input, 'callbackPath', 'callback_path'),
            logoutPath: $this->field($input, 'logoutPath', 'logout_path'),
            ownerEmail: $this->field($input, 'ownerEmail', 'owner_email'),
            provisioning: $this->option($input, 'provisioning', 'jit'),
        );
    }

    /**
     * @return list<string>
     */
    public function validate(ClientIntegrationDraft $draft): array
    {
        return [
            ...$this->requiredViolations($draft),
            ...$this->optionViolations($draft),
            ...$this->clientIdViolations($draft),
            ...$this->baseUrlViolations($draft),
            ...$this->pathViolations($draft->callbackPath, 'Callback path'),
            ...$this->pathViolations($draft->logoutPath, 'Logout path'),
            ...$this->ownerEmailViolations($draft),
            ...$this->registryViolations($draft),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function build(ClientIntegrationDraft $draft): array
    {
        $uris = $this->uris($draft);

        return [
            ...$this->oidcContract($draft, $uris),
            'scopes' => $this->scopes($draft),
            'env' => $this->envLines($draft, $uris),
            'registryPatch' => $this->registryPatch($draft, $uris),
            'provisioningManifest' => $this->readiness->build($draft),
            'provisioningSteps' => $this->provisioningSteps($draft),
            'rolloutSteps' => $this->rolloutSteps($draft),
            'rollbackSteps' => $this->rollbackSteps($draft),
            'findings' => $this->findings($draft),
        ];
    }

    /**
     * @param  array{redirectUri: string, backchannelLogoutUri: string}  $uris
     * @return array<string, string>
     */
    private function oidcContract(ClientIntegrationDraft $draft, array $uris): array
    {
        return [
            'clientId' => $draft->clientId,
            'displayName' => $draft->appName,
            'redirectUri' => $uris['redirectUri'],
            'backchannelLogoutUri' => $uris['backchannelLogoutUri'],
            'authorizeUrl' => $this->issuerUrl('/authorize'),
            'tokenUrl' => $this->issuerUrl('/token'),
            'userinfoUrl' => $this->issuerUrl('/userinfo'),
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     */
    private function field(array $input, string $camel, string $snake): string
    {
        $value = $input[$camel] ?? $input[$snake] ?? '';

        return is_string($value) ? trim($value) : '';
    }

    /**
     * @param  array<string, mixed>  $input
     */
    private function option(array $input, string $key, string $fallback): string
    {
        $value = $input[$key] ?? $fallback;

        return is_string($value) && $value !== '' ? trim($value) : $fallback;
    }

    /**
     * @return list<string>
     */
    private function requiredViolations(ClientIntegrationDraft $draft): array
    {
        return array_values(array_filter([
            $draft->appName === '' ? 'Nama aplikasi wajib diisi.' : null,
            $draft->clientId === '' ? 'Client ID wajib diisi.' : null,
            $draft->appBaseUrl === '' ? 'Base URL wajib diisi.' : null,
            $draft->ownerEmail === '' ? 'Owner email wajib diisi.' : null,
        ]));
    }

    /**
     * @return list<string>
     */
    private function optionViolations(ClientIntegrationDraft $draft): array
    {
        return array_values(array_filter([
            in_array($draft->environment, ['live', 'development'], true) ? null : 'Status aplikasi tidak valid.',
            in_array($draft->clientType, ['public', 'confidential'], true) ? null : 'Jenis client tidak valid.',
            in_array($draft->provisioning, ['jit', 'scim'], true) ? null : 'Provisioning tidak valid.',
        ]));
    }

    /**
     * @return list<string>
     */
    private function clientIdViolations(ClientIntegrationDraft $draft): array
    {
        if ($draft->clientId === '') {
            return [];
        }

        return preg_match('/^[a-z0-9][a-z0-9-]{2,62}$/', $draft->clientId) === 1
            ? []
            : ['Client ID harus slug 3-63 karakter.'];
    }

    /**
     * @return list<string>
     */
    private function baseUrlViolations(ClientIntegrationDraft $draft): array
    {
        $url = $this->parseUrl($draft->appBaseUrl);
        if ($url === null) {
            return ['Base URL harus URL valid.'];
        }

        if (str_contains($draft->appBaseUrl, '*')) {
            return ['Base URL tidak boleh wildcard.'];
        }

        return $this->secureBaseUrlViolations($url, $draft->environment);
    }

    /**
     * @param  array{scheme?: string, host?: string}  $url
     * @return list<string>
     */
    private function secureBaseUrlViolations(array $url, string $environment): array
    {
        if (($url['scheme'] ?? null) === 'https') {
            return [];
        }

        return $environment === 'development' && $this->isLocalhost($url) ? [] : ['Live client wajib memakai HTTPS.'];
    }

    /**
     * @return list<string>
     */
    private function pathViolations(string $path, string $label): array
    {
        if (! str_starts_with($path, '/')) {
            return ["{$label} harus diawali /."];
        }

        return str_contains($path, '*') ? ["{$label} tidak boleh wildcard."] : [];
    }

    /**
     * @return list<string>
     */
    private function ownerEmailViolations(ClientIntegrationDraft $draft): array
    {
        if ($draft->ownerEmail === '') {
            return [];
        }

        return filter_var($draft->ownerEmail, FILTER_VALIDATE_EMAIL) ? [] : ['Owner email harus valid.'];
    }

    /**
     * @return list<string>
     */
    private function registryViolations(ClientIntegrationDraft $draft): array
    {
        return [
            ...$this->clientIdConflict($draft),
            ...$this->redirectUriConflict($draft),
        ];
    }

    /**
     * @return list<string>
     */
    private function clientIdConflict(ClientIntegrationDraft $draft): array
    {
        return $this->clients->find($draft->clientId) === null ? [] : ['Client ID sudah terdaftar di broker.'];
    }

    /**
     * @return list<string>
     */
    private function redirectUriConflict(ClientIntegrationDraft $draft): array
    {
        $redirectUri = $this->redirectUri($draft);
        if ($redirectUri === null) {
            return [];
        }

        return $this->redirectInUse($redirectUri) ? ['Redirect URI sudah dipakai client lain.'] : [];
    }

    private function redirectInUse(string $redirectUri): bool
    {
        foreach ($this->clients->ids() as $clientId) {
            if ($this->clients->find($clientId)?->allowsRedirectUri($redirectUri)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array{scheme?: string, host?: string}|null
     */
    private function parseUrl(string $input): ?array
    {
        $parts = parse_url($input);

        return is_array($parts) && isset($parts['scheme'], $parts['host']) ? $parts : null;
    }

    /**
     * @param  array{host?: string}  $url
     */
    private function isLocalhost(array $url): bool
    {
        return in_array($url['host'] ?? '', ['localhost', '127.0.0.1', '::1'], true);
    }

    private function redirectUri(ClientIntegrationDraft $draft): ?string
    {
        return $this->parseUrl($draft->appBaseUrl) === null ? null : $this->uris($draft)['redirectUri'];
    }

    /**
     * @return array{redirectUri: string, backchannelLogoutUri: string}
     */
    private function uris(ClientIntegrationDraft $draft): array
    {
        $baseUrl = rtrim($draft->appBaseUrl, '/');

        return [
            'redirectUri' => $baseUrl.$draft->callbackPath,
            'backchannelLogoutUri' => $baseUrl.$draft->logoutPath,
        ];
    }

    private function issuerUrl(string $path): string
    {
        return rtrim((string) config('sso.base_url'), '/').$path;
    }

    /**
     * @return list<string>
     */
    private function scopes(ClientIntegrationDraft $draft): array
    {
        $scopes = ['openid', 'profile', 'email', 'offline_access'];

        return $draft->clientType === 'confidential' ? [...$scopes, 'sso:session.register'] : $scopes;
    }

    /**
     * @param  array{redirectUri: string, backchannelLogoutUri: string}  $uris
     * @return list<string>
     */
    private function envLines(ClientIntegrationDraft $draft, array $uris): array
    {
        $lines = [
            'SSO_ISSUER='.rtrim((string) config('sso.base_url'), '/'),
            'SSO_CLIENT_ID='.$draft->clientId,
            'SSO_REDIRECT_URI='.$uris['redirectUri'],
            'SSO_BACKCHANNEL_LOGOUT_URI='.$uris['backchannelLogoutUri'],
        ];

        return $draft->clientType === 'confidential' ? [...$lines, 'SSO_CLIENT_SECRET=<store-in-vault>'] : $lines;
    }

    /**
     * @param  array{redirectUri: string, backchannelLogoutUri: string}  $uris
     * @return list<string>
     */
    private function registryPatch(ClientIntegrationDraft $draft, array $uris): array
    {
        $lines = [
            "'{$draft->clientId}' => [",
            "  'type' => '{$draft->clientType}',",
            "  'redirect_uris' => ['{$uris['redirectUri']}'],",
            "  'post_logout_redirect_uris' => ['".rtrim($draft->appBaseUrl, '/')."'],",
            "  'backchannel_logout_uri' => '{$uris['backchannelLogoutUri']}',",
        ];

        return $draft->clientType === 'confidential'
            ? [...$lines, "  'secret' => env('".$this->secretEnv($draft)."'),", '],']
            : [...$lines, '],'];
    }

    private function secretEnv(ClientIntegrationDraft $draft): string
    {
        return strtoupper(str_replace('-', '_', $draft->clientId)).'_CLIENT_SECRET_HASH';
    }

    /**
     * @return list<string>
     */
    private function provisioningSteps(ClientIntegrationDraft $draft): array
    {
        return $draft->provisioning === 'scim' ? $this->scimSteps() : $this->jitSteps();
    }

    /**
     * @return list<string>
     */
    private function jitSteps(): array
    {
        return ['Create local profile on first login.', 'Map sub, email, name, role, sid.', 'Deactivate from SSO session revoke.'];
    }

    /**
     * @return list<string>
     */
    private function scimSteps(): array
    {
        return ['Create SCIM service token in vault.', 'Sync Users and Groups.', 'Handle deactivate before local login.'];
    }

    /**
     * @return list<string>
     */
    private function rolloutSteps(ClientIntegrationDraft $draft): array
    {
        $first = $draft->environment === 'live'
            ? 'Route 5% admin/tester traffic to SSO.'
            : 'Use isolated dev redirect URI.';

        return [$first, 'Verify callback, refresh rotation, and back-channel logout.', 'Promote only after health and audit checks pass.'];
    }

    /**
     * @return list<string>
     */
    private function rollbackSteps(ClientIntegrationDraft $draft): array
    {
        $first = $draft->environment === 'live' ? 'Disable SSO client toggle.' : 'Delete dev client registration.';

        return [$first, 'Restore previous auth route.', 'Revoke issued sessions for this client_id.'];
    }

    /**
     * @return list<string>
     */
    private function findings(ClientIntegrationDraft $draft): array
    {
        $provisioning = $draft->provisioning === 'scim'
            ? 'RFC 7642 lifecycle covered by SCIM provisioning.'
            : 'JIT provisioning is acceptable for login-only apps.';

        return ['No wildcard redirect URI.', 'Token storage must use HttpOnly Secure cookie.', $provisioning];
    }
}
