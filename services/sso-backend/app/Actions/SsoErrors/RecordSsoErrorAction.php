<?php

declare(strict_types=1);

namespace App\Actions\SsoErrors;

use App\Support\SsoErrors\SsoErrorContext;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

final class RecordSsoErrorAction
{
    public function execute(SsoErrorContext $context): string
    {
        $errorReference = 'SSOERR-'.Str::upper(Str::random(10));

        Log::warning('[SSO_ERROR_RECORDED]', $this->logContext($context, $errorReference));

        return $errorReference;
    }

    /**
     * @return array<string, mixed>
     */
    private function logContext(SsoErrorContext $context, string $errorReference): array
    {
        return array_filter([
            'error_ref' => $errorReference,
            'error_code' => $context->code->value,
            'safe_reason' => $context->safeReason,
            'technical_reason_hash' => hash('sha256', $context->technicalReason),
            'client_id' => $context->clientId,
            'redirect_uri_hash' => $this->hashOptional($context->redirectUri),
            'subject_id_hash' => $this->hashOptional($context->subjectId),
            'session_id_hash' => $this->hashOptional($context->sessionId),
            'correlation_id' => $context->correlationId,
            'retry_allowed' => $context->retryAllowed,
            'alternative_login_allowed' => $context->alternativeLoginAllowed,
        ], static fn (mixed $value): bool => $value !== null);
    }

    private function hashOptional(?string $value): ?string
    {
        return $value === null || $value === '' ? null : hash('sha256', $value);
    }
}
