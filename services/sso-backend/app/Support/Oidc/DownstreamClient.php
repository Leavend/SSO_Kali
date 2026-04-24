<?php

declare(strict_types=1);

namespace App\Support\Oidc;

final readonly class DownstreamClient
{
    /**
     * @param  list<string>  $redirectUris
     * @param  list<string>  $postLogoutRedirectUris
     */
    public function __construct(
        public string $clientId,
        public string $type,
        public array $redirectUris,
        public array $postLogoutRedirectUris,
        public ?string $backchannelLogoutUri = null,
        public ?string $secret = null,
    ) {}

    public function allowsRedirectUri(string $redirectUri): bool
    {
        return in_array($redirectUri, $this->redirectUris, true);
    }

    public function isPublic(): bool
    {
        return $this->type === 'public';
    }

    public function requiresClientSecret(): bool
    {
        return ! $this->isPublic();
    }
}
