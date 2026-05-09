<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Admin\UpdateManagedClientAction;
use App\Http\Requests\Admin\UpdateManagedClientRequest;
use App\Models\OidcClientRegistration;
use App\Models\User;
use App\Services\Oidc\ClientIntegrationContractBuilder;
use App\Services\Oidc\ClientIntegrationRegistrationService;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Oidc\ClientIntegrationDraft;
use App\Support\Oidc\DownstreamClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class ClientController
{
    public function __construct(
        private readonly DownstreamClientRegistry $clients,
    ) {}

    public function index(): JsonResponse
    {
        $clientIds = $this->clients->ids();
        $clients = [];

        foreach ($clientIds as $clientId) {
            $client = $this->clients->find($clientId);

            if ($client === null) {
                continue;
            }

            $clients[] = $this->payload($client);
        }

        return response()->json(['clients' => $clients]);
    }

    public function show(string $clientId): JsonResponse
    {
        $registration = $this->registration($clientId);

        if (! $registration instanceof OidcClientRegistration) {
            return response()->json(['error' => 'Client not found.'], 404);
        }

        return response()->json(['client' => $this->registrationPayload($registration)]);
    }

    public function update(UpdateManagedClientRequest $request, UpdateManagedClientAction $action, string $clientId): JsonResponse
    {
        try {
            $registration = $action->execute($request, $this->admin($request), $clientId, $request->validated());
        } catch (RuntimeException $exception) {
            return $this->invalidIntegration($exception);
        }

        return response()->json(['client' => $this->registrationPayload($registration)]);
    }

    public function destroy(
        Request $request,
        ClientIntegrationRegistrationService $registrations,
        string $clientId,
    ): JsonResponse {
        return $this->disable($request, $registrations, $clientId);
    }

    public function contract(Request $request, ClientIntegrationContractBuilder $builder): JsonResponse
    {
        $draft = $builder->draftFrom($request->all());
        $violations = $builder->validate($draft);

        if ($violations !== []) {
            return response()->json([
                'error' => 'client_integration_invalid',
                'message' => 'Client integration contract belum memenuhi guardrail broker.',
                'violations' => $violations,
            ], 422);
        }

        return response()->json(['contract' => $builder->build($draft)]);
    }

    public function registrations(ClientIntegrationRegistrationService $registrations): JsonResponse
    {
        return response()->json(['registrations' => $registrations->registrations()]);
    }

    public function stage(Request $request, ClientIntegrationRegistrationService $registrations): JsonResponse
    {
        try {
            $draft = $this->draft($request);
            $registration = $registrations->stage($request, $this->admin($request), $draft);
        } catch (RuntimeException $exception) {
            return $this->invalidIntegration($exception);
        }

        return response()->json(['registration' => $registrations->payload($registration)]);
    }

    public function activate(
        Request $request,
        ClientIntegrationRegistrationService $registrations,
        string $clientId,
    ): JsonResponse {
        try {
            $registration = $registrations->activate($request, $this->admin($request), $clientId, $this->secretHash($request));
        } catch (RuntimeException $exception) {
            return $this->invalidIntegration($exception);
        }

        return response()->json(['registration' => $registrations->payload($registration)]);
    }

    public function disable(
        Request $request,
        ClientIntegrationRegistrationService $registrations,
        string $clientId,
    ): JsonResponse {
        try {
            $registration = $registrations->disable($request, $this->admin($request), $clientId);
        } catch (RuntimeException $exception) {
            return $this->invalidIntegration($exception);
        }

        return response()->json(['registration' => $registrations->payload($registration)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(DownstreamClient $client): array
    {
        return [
            'client_id' => $client->clientId,
            'type' => $client->type,
            'redirect_uris' => $client->redirectUris,
            'backchannel_logout_uri' => $this->displayBackchannelUri($client->backchannelLogoutUri),
            'backchannel_logout_internal' => $this->isInternalUri($client->backchannelLogoutUri),
        ];
    }

    private function registration(string $clientId): ?OidcClientRegistration
    {
        return OidcClientRegistration::query()->where('client_id', $clientId)->first();
    }

    /**
     * @return array<string, mixed>
     */
    private function registrationPayload(OidcClientRegistration $registration): array
    {
        return [
            ...$registration->only([
                'client_id',
                'display_name',
                'type',
                'environment',
                'app_base_url',
                'redirect_uris',
                'post_logout_redirect_uris',
                'backchannel_logout_uri',
                'owner_email',
                'provisioning',
                'status',
                'activated_at',
                'disabled_at',
            ]),
            'has_secret_hash' => is_string($registration->secret_hash) && $registration->secret_hash !== '',
        ];
    }

    private function draft(Request $request): ClientIntegrationDraft
    {
        return app(ClientIntegrationContractBuilder::class)->draftFrom($request->all());
    }

    private function admin(Request $request): User
    {
        /** @var User $admin */
        $admin = $request->attributes->get('admin_user');

        return $admin;
    }

    private function secretHash(Request $request): ?string
    {
        $value = $request->input('secretHash', $request->input('secret_hash'));

        return is_string($value) && $value !== '' ? $value : null;
    }

    private function invalidIntegration(RuntimeException $exception): JsonResponse
    {
        return response()->json([
            'error' => 'client_integration_invalid',
            'message' => $exception->getMessage(),
        ], 422);
    }

    private function displayBackchannelUri(?string $uri): ?string
    {
        if ($uri === null || $this->isInternalUri($uri)) {
            return null;
        }

        return $uri;
    }

    private function isInternalUri(?string $uri): bool
    {
        $host = is_string($uri) ? parse_url($uri, PHP_URL_HOST) : null;

        if (! is_string($host) || $host === '') {
            return false;
        }

        if (in_array($host, ['localhost', '127.0.0.1', '::1'], true)) {
            return true;
        }

        return ! str_contains($host, '.') || $this->isPrivateIp($host);
    }

    private function isPrivateIp(string $host): bool
    {
        if (filter_var($host, FILTER_VALIDATE_IP) === false) {
            return false;
        }

        return filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
    }
}
