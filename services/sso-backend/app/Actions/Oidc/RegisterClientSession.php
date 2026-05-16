<?php

declare(strict_types=1);

namespace App\Actions\Oidc;

use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\BackChannelSessionRegistry;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Oidc\DownstreamClient;
use App\Support\Responses\OidcErrorResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use RuntimeException;

final class RegisterClientSession
{
    public function __construct(
        private readonly AccessTokenGuard $tokens,
        private readonly DownstreamClientRegistry $clients,
        private readonly BackChannelSessionRegistry $registry,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        $claims = $this->claims($request);
        $sessionId = $this->stringClaim($claims, 'sid');
        $clientId = $this->stringClaim($claims, 'client_id');

        if ($sessionId === null || $clientId === null) {
            return OidcErrorResponse::json('invalid_token', 'The bearer token is invalid.', 401);
        }

        if (! $this->registerClient($sessionId, $clientId, $claims)) {
            return OidcErrorResponse::json('invalid_client', 'Client is missing a back-channel logout URI.', 400);
        }

        return response()->json(['registered' => true, 'client_id' => $clientId, 'sid' => $sessionId]);
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function registerClient(string $sessionId, string $clientId, array $claims): bool
    {
        $client = $this->clientWithLogoutChannel($clientId);

        if ($client === null) {
            return false;
        }

        $this->registry->register(
            $sessionId,
            $clientId,
            (string) ($client->backchannelLogoutUri ?? ''),
            $this->metadata($claims, $client),
        );

        return true;
    }

    /**
     * BE-FR043-001: registration succeeds when the client supports either
     * back-channel logout (POST) OR front-channel logout (iframe). RPs with
     * neither channel cannot be notified during global logout, so they are
     * still rejected — preserving the existing FR-040 invariant.
     */
    private function clientWithLogoutChannel(string $clientId): ?DownstreamClient
    {
        $client = $this->clients->find($clientId);

        if ($client === null || ! $client->supportsLogoutNotification()) {
            return null;
        }

        return $client;
    }

    /**
     * @return array<string, mixed>
     */
    private function claims(Request $request): array
    {
        try {
            return $this->tokens->claimsFrom((string) $request->bearerToken());
        } catch (RuntimeException) {
            return [];
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     * @return array<string, mixed>
     */
    private function metadata(array $claims, DownstreamClient $client): array
    {
        return [
            'subject_id' => $this->stringClaim($claims, 'sub'),
            'scope' => $this->stringClaim($claims, 'scope'),
            'created_at' => $this->timeClaim($claims, 'iat'),
            'expires_at' => $this->timeClaim($claims, 'exp'),
            'frontchannel_logout_uri' => $client->frontchannelLogoutUri,
            'channels' => $this->channels($client),
        ];
    }

    /**
     * @return list<string>
     */
    private function channels(DownstreamClient $client): array
    {
        $channels = [];
        if ($client->backchannelLogoutUri !== null && $client->backchannelLogoutUri !== '') {
            $channels[] = 'backchannel';
        }
        if ($client->frontchannelLogoutUri !== null && $client->frontchannelLogoutUri !== '') {
            $channels[] = 'frontchannel';
        }

        return $channels;
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function stringClaim(array $claims, string $name): ?string
    {
        return is_string($claims[$name] ?? null) && $claims[$name] !== '' ? $claims[$name] : null;
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function timeClaim(array $claims, string $name): ?string
    {
        return is_int($claims[$name] ?? null)
            ? Carbon::createFromTimestamp((int) $claims[$name])->toDateTimeString()
            : null;
    }
}
