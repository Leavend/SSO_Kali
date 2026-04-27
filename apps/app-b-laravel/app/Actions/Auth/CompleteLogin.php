<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Services\Sso\AppSessionStore;
use App\Services\Sso\BrokerTokenVerifier;
use App\Services\Sso\SsoHttpClient;
use App\Services\Sso\UserSynchronizer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Throwable;

final class CompleteLogin
{
    public function __construct(
        private readonly AppSessionStore $sessions,
        private readonly SsoHttpClient $client,
        private readonly BrokerTokenVerifier $tokens,
        private readonly UserSynchronizer $users,
    ) {}

    public function handle(Request $request): RedirectResponse
    {
        // Silent SSO check failed — no active ZITADEL session.
        // Redirect to landing with sso_checked=1 to show manual login button.
        $upstreamError = (string) $request->query('error', '');
        if ($upstreamError === 'login_required' || $upstreamError === 'interaction_required') {
            $this->sessions->pullTransaction();

            return redirect('/?sso_checked=1&event=sso-miss');
        }

        $transaction = $this->sessions->pullTransaction();
        $state = (string) $request->query('state', '');
        $code = (string) $request->query('code', '');

        if (! $this->validRequest($transaction, $state, $code)) {
            return redirect('/?event=expired-state');
        }

        return $this->complete($request, $code, $transaction);
    }

    /**
     * @param  array<string, string>  $transaction
     */
    private function complete(Request $request, string $code, array $transaction): RedirectResponse
    {
        try {
            [$tokens, $claims] = $this->tokensAndClaims($code, $transaction);
            $profile = $this->client->profile((string) $tokens['access_token']);
            $this->completeSession($request, $claims, $tokens, $profile);
        } catch (Throwable $exception) {
            report($exception);
            $this->sessions->clearCurrent();

            return redirect('/?event=handshake-failed');
        }

        return redirect('/dashboard')->with('status', 'Handshake SSO selesai dan sesi App B sudah aktif.');
    }

    /**
     * @param  array<string, string>|null  $transaction
     */
    private function validRequest(?array $transaction, string $state, string $code): bool
    {
        return $transaction !== null
            && $code !== ''
            && hash_equals((string) $transaction['state'], $state);
    }

    /**
     * @param  array<string, string>  $transaction
     * @return array{0: array<string, mixed>, 1: array<string, mixed>}
     */
    private function tokensAndClaims(string $code, array $transaction): array
    {
        $tokens = $this->client->exchangeCode($code, (string) $transaction['code_verifier']);
        $accessClaims = $this->tokens->verifyAccessToken((string) $tokens['access_token']);
        $idClaims = $this->tokens->verifyIdToken((string) $tokens['id_token'], (string) $transaction['nonce']);
        $this->assertMatchingSubject($accessClaims, $idClaims);

        return [$tokens, $accessClaims];
    }

    /**
     * @param  array<string, mixed>  $accessClaims
     * @param  array<string, mixed>  $idClaims
     */
    private function assertMatchingSubject(array $accessClaims, array $idClaims): void
    {
        if (($accessClaims['sub'] ?? null) !== ($idClaims['sub'] ?? null)) {
            throw new \RuntimeException('Token subject mismatch.');
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     * @param  array<string, mixed>  $tokens
     * @param  array<string, mixed>  $profile
     */
    private function completeSession(Request $request, array $claims, array $tokens, array $profile): void
    {
        $user = $this->users->sync($claims, $profile);
        $request->session()->regenerate();
        Auth::login($user);
        $this->sessions->storeAuthenticatedSession($claims, $tokens, $profile);
        $this->client->registerSession((string) $tokens['access_token']);
    }
}
