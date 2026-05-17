<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Actions\SsoErrors\BuildSsoErrorRedirectAction;
use App\Actions\SsoErrors\RecordSsoErrorAction;
use App\Enums\SsoErrorCode;
use App\Support\SsoErrors\SsoErrorContext;
use Illuminate\Http\Request;

final class AuthorizationSsoErrorReporter
{
    public function __construct(
        private readonly RecordSsoErrorAction $ssoErrors,
        private readonly BuildSsoErrorRedirectAction $errorRedirects,
    ) {}

    /** @param array<string, mixed> $context */
    public function record(
        SsoErrorCode $code,
        string $safeReason,
        string $technicalReason,
        Request $request,
        array $context,
    ): string {
        return $this->ssoErrors->execute(
            $this->context($code, $safeReason, $technicalReason, $request, $context),
        );
    }

    /** @param array<string, mixed> $context */
    public function redirect(
        SsoErrorCode $code,
        string $safeReason,
        string $technicalReason,
        Request $request,
        array $context,
        bool $retryAllowed,
        bool $alternativeLoginAllowed,
    ): string {
        $errorContext = $this->context(
            $code,
            $safeReason,
            $technicalReason,
            $request,
            $context,
            $retryAllowed,
            $alternativeLoginAllowed,
        );

        return $this->errorRedirects->execute($errorContext, $this->ssoErrors->execute($errorContext));
    }

    /** @param array<string, mixed> $context */
    private function context(
        SsoErrorCode $code,
        string $safeReason,
        string $technicalReason,
        Request $request,
        array $context,
        bool $retryAllowed = false,
        bool $alternativeLoginAllowed = false,
    ): SsoErrorContext {
        return new SsoErrorContext(
            code: $code,
            safeReason: $safeReason,
            technicalReason: $technicalReason,
            clientId: $this->optionalString($context['client_id'] ?? null),
            redirectUri: $this->optionalString($context['redirect_uri'] ?? null),
            sessionId: $this->optionalString($context['session_id'] ?? null),
            correlationId: $this->optionalString($request->headers->get('X-Request-Id')),
            retryAllowed: $retryAllowed,
            alternativeLoginAllowed: $alternativeLoginAllowed,
        );
    }

    private function optionalString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }
}
