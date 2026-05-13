<?php

declare(strict_types=1);

namespace App\Http\Controllers\Oidc;

use App\Actions\Oidc\ProcessConsentDecision;
use App\Services\Oidc\ConsentService;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Oidc\ScopePolicy;
use App\Support\Oidc\ScopeSet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * FR-011: Consent endpoints.
 *
 * GET  /connect/consent — returns consent page data (client info, scopes)
 * POST /connect/consent — processes user decision (allow/deny)
 */
final class ConsentController
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
        private readonly ScopePolicy $scopes,
        private readonly ConsentService $consents,
        private readonly ProcessConsentDecision $processDecision,
    ) {}

    /**
     * GET /connect/consent — consent page data for the frontend.
     */
    public function show(Request $request): JsonResponse
    {
        $clientId = (string) $request->query('client_id', '');
        $scope = (string) $request->query('scope', 'openid');
        $state = (string) $request->query('state', '');

        $client = $this->clients->find($clientId);

        if ($client === null) {
            return response()->json(['error' => 'invalid_client', 'message' => 'Unknown client.'], 400);
        }

        $requestedScopes = ScopeSet::fromString($scope);
        $scopeCatalog = $this->scopes->catalog();

        $scopeDetails = array_values(array_filter(
            $scopeCatalog,
            static fn (array $item): bool => in_array($item['name'], $requestedScopes, true),
        ));

        return response()->json([
            'client' => [
                'client_id' => $client->clientId,
                'display_name' => $this->displayName($client->clientId),
                'type' => $client->type,
            ],
            'scopes' => $scopeDetails,
            'state' => $state,
        ]);
    }

    /**
     * POST /connect/consent — process consent decision.
     */
    public function decide(Request $request): JsonResponse
    {
        return $this->processDecision->handle($request);
    }

    private function displayName(string $clientId): string
    {
        $configured = config("oidc_clients.clients.{$clientId}.display_name");

        return is_string($configured) && $configured !== '' ? $configured : $clientId;
    }
}
