<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Support\Audit\AuthenticationAuditRecord;
use App\Support\Oidc\DownstreamClient;
use Illuminate\Http\Request;

final class AuthorizationRequestAuditRecorder
{
    public function __construct(private readonly RecordAuthenticationAuditEventAction $audits) {}

    /**
     * @param  array<string, mixed>  $context
     * @param  array<string, mixed>|null  $browserContext
     */
    public function accepted(
        Request $request,
        DownstreamClient $client,
        array $context,
        string $decision,
        ?array $browserContext = null,
    ): void {
        $this->audits->execute(AuthenticationAuditRecord::authorizationRequestAccepted(
            clientId: $client->clientId,
            sessionId: $this->optionalString($context['session_id'] ?? null),
            subjectId: $this->optionalString($browserContext['subject_id'] ?? null),
            ipAddress: $request->ip(),
            userAgent: $request->userAgent(),
            requestId: $request->headers->get('X-Request-Id'),
            context: $this->auditContext($request, $client, $decision, $context),
        ));
    }

    /** @param array<string, mixed>|null $context */
    public function rejected(Request $request, ?DownstreamClient $client, string $errorCode, ?array $context = null): void
    {
        $this->audits->execute(AuthenticationAuditRecord::authorizationRequestRejected(
            clientId: $client?->clientId ?: $this->optionalString($request->query('client_id')),
            ipAddress: $request->ip(),
            userAgent: $request->userAgent(),
            errorCode: $errorCode,
            requestId: $request->headers->get('X-Request-Id'),
            context: $this->auditContext($request, $client, 'rejected', $context, $errorCode),
        ));
    }

    /**
     * @param  array<string, mixed>|null  $context
     * @return array<string, mixed>
     */
    private function auditContext(
        Request $request,
        ?DownstreamClient $client,
        string $decision,
        ?array $context = null,
        ?string $errorCode = null,
    ): array {
        return array_filter([
            'decision' => $decision,
            'error_code' => $errorCode,
            'client_type' => $client?->type,
            'redirect_uri_hash' => $this->hashOptional($this->optionalString($request->query('redirect_uri'))),
            'state_hash' => $this->hashOptional($this->optionalString($request->query('state'))),
            'nonce_hash' => $this->hashOptional($this->optionalString($request->query('nonce'))),
            'scope' => $this->optionalString($context['scope'] ?? $request->query('scope')),
            'prompt' => $this->optionalString($request->query('prompt')),
            'response_type' => $this->optionalString($request->query('response_type')),
            'code_challenge_method' => $this->optionalString($request->query('code_challenge_method')),
        ], static fn (mixed $value): bool => $value !== null);
    }

    private function hashOptional(?string $value): ?string
    {
        return $value === null ? null : hash('sha256', $value);
    }

    private function optionalString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }
}
