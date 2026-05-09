<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Requests\Admin\BuildClientIntegrationDraftRequest;
use App\Models\User;
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
            : AdminApiResponse::error('client_integration_invalid', 'Client integration contract belum memenuhi guardrail broker.', 422, ['violations' => $violations]);
    }

    public function registrations(ClientIntegrationRegistrationService $registrations): JsonResponse
    {
        return AdminApiResponse::ok(['registrations' => $registrations->registrations()]);
    }

    public function stage(BuildClientIntegrationDraftRequest $request, ClientIntegrationRegistrationService $registrations): JsonResponse
    {
        try {
            $registration = $registrations->stage($request, $this->admin($request), app(ClientIntegrationContractBuilder::class)->draftFrom($request->draftInput()));
        } catch (RuntimeException $exception) {
            return $this->invalidIntegration($exception);
        }

        return AdminApiResponse::ok(['registration' => $registrations->payload($registration)]);
    }

    public function activate(Request $request, ClientIntegrationRegistrationService $registrations, string $clientId): JsonResponse
    {
        try {
            $registration = $registrations->activate($request, $this->admin($request), $clientId, $this->secretHash($request));
        } catch (RuntimeException $exception) {
            return $this->invalidIntegration($exception);
        }

        return AdminApiResponse::ok(['registration' => $registrations->payload($registration)]);
    }

    public function disable(Request $request, ClientIntegrationRegistrationService $registrations, string $clientId): JsonResponse
    {
        try {
            $registration = $registrations->disable($request, $this->admin($request), $clientId);
        } catch (RuntimeException $exception) {
            return $this->invalidIntegration($exception);
        }

        return AdminApiResponse::ok(['registration' => $registrations->payload($registration)]);
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
        return AdminApiResponse::error('client_integration_invalid', $exception->getMessage(), 422);
    }
}
