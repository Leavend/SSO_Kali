<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Enums\SsoSessionLifecycleOutcome;
use App\Support\Oidc\AuthorizationClientSession;
use App\Support\Oidc\DownstreamClient;
use Illuminate\Http\Request;

final class BrowserAuthorizationSessionResolver
{
    public function __construct(
        private readonly SsoBrowserSession $browserSession,
        private readonly HighAssuranceClientPolicy $assurance,
        private readonly AcrEvaluator $acrEvaluator,
        private readonly SsoSessionLifecycleGuard $sessionLifecycle,
        private readonly AuthorizationRequestAuditRecorder $audits,
    ) {}

    /** @param array<string, mixed> $context */
    public function reusable(Request $request, DownstreamClient $client, array $context): ?AuthorizationClientSession
    {
        $browserContext = $this->browserSession->context($request);
        if ($browserContext === null || ! $this->lifecycleAllows($request, $client, $context, $browserContext)) {
            return null;
        }
        if (! $this->canUse($request, $client, $browserContext)) {
            return null;
        }

        return new AuthorizationClientSession($client, $context, $browserContext);
    }

    /** @param array<string, mixed> $context @param array<string, mixed> $browserContext */
    private function lifecycleAllows(Request $request, DownstreamClient $client, array $context, array $browserContext): bool
    {
        $lifecycle = $this->sessionLifecycle->evaluate($this->optionalString($browserContext['subject_id'] ?? null) ?? '');
        if ($lifecycle->isAllowed()) {
            return true;
        }

        $this->browserSession->forget($request);
        $this->audits->rejected($request, $client, $this->lifecycleAuditCode($lifecycle->outcome), $context);

        return false;
    }

    /** @param array<string, mixed> $context */
    private function canUse(Request $request, DownstreamClient $client, array $context): bool
    {
        if ($this->assurance->requiresInteractiveLogin($client)) {
            return false;
        }
        if (in_array($this->prompt($request), ['login', 'consent', 'select_account'], true)) {
            return false;
        }

        return $this->acrSatisfied($request, $context) && $this->maxAgeIsFresh($request, $context);
    }

    /** @param array<string, mixed> $context */
    private function acrSatisfied(Request $request, array $context): bool
    {
        $requestedAcr = $request->query('acr_values');
        if (! is_string($requestedAcr) || $requestedAcr === '') {
            return true;
        }

        return $this->acrEvaluator->satisfies($this->optionalString($context['acr'] ?? null), $requestedAcr);
    }

    /** @param array<string, mixed> $context */
    private function maxAgeIsFresh(Request $request, array $context): bool
    {
        $maxAge = $request->query('max_age');
        if (! is_string($maxAge) || ! ctype_digit($maxAge)) {
            return true;
        }

        $authTime = is_int($context['auth_time'] ?? null) ? $context['auth_time'] : 0;

        return $maxAge !== '0' && $authTime > 0 && time() - $authTime <= (int) $maxAge;
    }

    private function lifecycleAuditCode(SsoSessionLifecycleOutcome $outcome): string
    {
        return 'sso_session_lifecycle_'.$outcome->value;
    }

    private function prompt(Request $request): ?string
    {
        $prompt = $request->query('prompt');

        return is_string($prompt) && $prompt !== '' ? $prompt : null;
    }

    private function optionalString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }
}
