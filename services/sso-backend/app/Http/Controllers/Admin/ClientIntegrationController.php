<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Requests\Admin\BuildClientIntegrationDraftRequest;
use App\Services\Oidc\ClientIntegrationContractBuilder;
use App\Services\Oidc\ClientIntegrationRegistrationService;
use App\Support\Responses\AdminApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

final class ClientIntegrationController
{
    public function contract(BuildClientIntegrationDraftRequest $request, ClientIntegrationContractBuilder $builder): JsonResponse
    {
        $draft = $builder->draftFrom($request->draftInput());
        $violations = $builder->validate($draft);

        return $violations === []
            ? AdminApiResponse::ok(['contract' => $builder->build($draft)])
            : AdminApiResponse::error('client_integration_invalid', 'Client integration contract belum memenuhi guardrail SSO.', 422, ['violations' => $violations]);
    }

    public function registrations(ClientIntegrationRegistrationService $registrations): JsonResponse
    {
        return AdminApiResponse::ok(['registrations' => $registrations->registrations()]);
    }

    public function stage(BuildClientIntegrationDraftRequest $request, ClientIntegrationRegistrationService $registrations): JsonResponse
    {
        try {
            $registration = $registrations->stage($request, $request->attributes->get('admin_user'), app(ClientIntegrationContractBuilder::class)->draftFrom($request->draftInput()));
        } catch (RuntimeException $exception) {
            return $this->invalid($exception);
        }

        return AdminApiResponse::ok(['registration' => $registrations->payload($registration)]);
    }

    public function create(BuildClientIntegrationDraftRequest $request, ClientIntegrationRegistrationService $registrations): JsonResponse
    {
        try {
            $created = $registrations->create($request, $request->attributes->get('admin_user'), app(ClientIntegrationContractBuilder::class)->draftFrom($request->draftInput()));
        } catch (RuntimeException $exception) {
            return $this->invalid($exception);
        }

        $payload = ['registration' => $registrations->payload($created['registration'])];
        if (isset($created['plaintext_secret'])) {
            $payload['plaintext_secret'] = $created['plaintext_secret'];
        }

        return AdminApiResponse::created($payload)->header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }

    public function activate(Request $request, ClientIntegrationRegistrationService $registrations, string $clientId): JsonResponse
    {
        $hash = is_string($value = $request->input('secretHash', $request->input('secret_hash'))) && $value !== '' ? $value : null;

        try {
            $registration = $registrations->activate($request, $request->attributes->get('admin_user'), $clientId, $hash);
        } catch (RuntimeException $exception) {
            return $this->invalid($exception);
        }

        return AdminApiResponse::ok(['registration' => $registrations->payload($registration)]);
    }

    public function disable(Request $request, ClientIntegrationRegistrationService $registrations, string $clientId): JsonResponse
    {
        return $this->lifecycle($request, $registrations, 'disable', $clientId);
    }

    public function decommission(Request $request, ClientIntegrationRegistrationService $registrations, string $clientId): JsonResponse
    {
        return $this->lifecycle($request, $registrations, 'decommission', $clientId);
    }

    private function lifecycle(Request $request, ClientIntegrationRegistrationService $registrations, string $method, string $clientId): JsonResponse
    {
        try {
            $reason = is_string($request->input('reason')) ? $request->input('reason') : null;
            $registration = $registrations->{$method}($request, $request->attributes->get('admin_user'), $clientId, $reason);
        } catch (RuntimeException $exception) {
            return $this->invalid($exception);
        }

        return AdminApiResponse::ok(['registration' => $registrations->payload($registration)]);
    }

    private function invalid(RuntimeException $exception): JsonResponse
    {
        return AdminApiResponse::error('client_integration_invalid', $exception->getMessage(), $exception->getCode() >= 400 && $exception->getCode() <= 599 ? $exception->getCode() : 422);
    }
}
