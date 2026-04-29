<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Models\OidcClientRegistration;

final class ClientIntegrationRollbackRevoker
{
    public function __construct(
        private readonly RefreshTokenStore $refreshTokens,
        private readonly AccessTokenRevocationStore $accessTokens,
        private readonly BackChannelLogoutDispatcher $logout,
    ) {}

    /**
     * @return array{revoked_tokens: int, revoked_sessions: int, backchannel_fanout: int}
     */
    public function revoke(OidcClientRegistration $registration): array
    {
        $records = $this->refreshTokens->revokeClient($registration->client_id);
        $this->accessTokens->revokeClient($registration->client_id);
        $sessions = $this->sessionRecords($records);

        return [
            'revoked_tokens' => count($records),
            'revoked_sessions' => count($sessions),
            'backchannel_fanout' => $this->fanout($registration, $sessions),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $records
     * @return list<array{subject_id: string, session_id: string}>
     */
    private function sessionRecords(array $records): array
    {
        $sessions = [];

        foreach ($records as $record) {
            $subjectId = is_string($record['subject_id'] ?? null) ? $record['subject_id'] : null;
            $sessionId = is_string($record['session_id'] ?? null) ? $record['session_id'] : null;

            if ($subjectId !== null && $sessionId !== null) {
                $sessions[$subjectId.'|'.$sessionId] = [
                    'subject_id' => $subjectId,
                    'session_id' => $sessionId,
                ];
            }
        }

        return array_values($sessions);
    }

    /**
     * @param  list<array{subject_id: string, session_id: string}>  $sessions
     */
    private function fanout(OidcClientRegistration $registration, array $sessions): int
    {
        if (! $this->hasBackChannel($registration)) {
            return 0;
        }

        return (int) array_sum(array_map(
            fn (array $session): int => $this->dispatch($registration, $session),
            $sessions,
        ));
    }

    /**
     * @param  array{subject_id: string, session_id: string}  $session
     */
    private function dispatch(OidcClientRegistration $registration, array $session): int
    {
        return count($this->logout->dispatch(
            $session['subject_id'],
            $session['session_id'],
            [$this->logoutRegistration($registration)],
        ));
    }

    /**
     * @return array{client_id: string, backchannel_logout_uri: string}
     */
    private function logoutRegistration(OidcClientRegistration $registration): array
    {
        return [
            'client_id' => $registration->client_id,
            'backchannel_logout_uri' => (string) $registration->backchannel_logout_uri,
        ];
    }

    private function hasBackChannel(OidcClientRegistration $registration): bool
    {
        return is_string($registration->backchannel_logout_uri)
            && $registration->backchannel_logout_uri !== '';
    }
}
