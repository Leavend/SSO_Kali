<?php

declare(strict_types=1);

namespace App\Http\Controllers\Resource;

use App\Models\User;
use App\Rules\StrongPassword;
use App\Services\Admin\AdminAuditEventStore;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\RefreshTokenStore;
use App\Services\Session\SsoSessionCookieResolver;
use App\Services\Session\SsoSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

final class ChangePasswordController
{
    public function __construct(
        private readonly SsoSessionCookieResolver $cookies,
        private readonly SsoSessionService $sessionService,
        private readonly RefreshTokenStore $refreshTokens,
        private readonly AccessTokenRevocationStore $accessTokens,
        private readonly AdminAuditEventStore $audits,
    ) {}

    /**
     * POST /api/profile/change-password — change user password.
     */
    public function __invoke(Request $request): JsonResponse
    {
        $session = $this->sessionService->current($this->cookies->resolve($request));
        if (! $session) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $user = User::find($session->user_id);
        if (! $user) {
            return response()->json(['message' => 'Pengguna tidak ditemukan.'], 404);
        }

        $validator = Validator::make($request->only(['current_password', 'new_password', 'new_password_confirmation']), [
            'current_password' => ['required', 'string'],
            'new_password' => ['required', 'string', new StrongPassword, 'confirmed'],
        ], [
            'current_password.required' => 'Password saat ini wajib diisi.',
            'new_password.required' => 'Password baru wajib diisi.',
            'new_password.min' => 'Password baru minimal 8 karakter.',
            'new_password.confirmed' => 'Konfirmasi password baru tidak cocok.',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validasi gagal.',
                'errors' => $validator->errors(),
            ], 422);
        }

        // Verify current password
        if (! Hash::check($request->input('current_password'), $user->password)) {
            return response()->json([
                'message' => 'Validasi gagal.',
                'errors' => ['current_password' => ['Password saat ini salah.']],
            ], 422);
        }

        // Prevent reuse of same password
        if (Hash::check($request->input('new_password'), $user->password)) {
            return response()->json([
                'message' => 'Validasi gagal.',
                'errors' => ['new_password' => ['Password baru tidak boleh sama dengan password lama.']],
            ], 422);
        }

        $changedAt = now();
        $user->password = Hash::make($request->input('new_password'));
        $user->password_changed_at = $changedAt;
        $user->save();

        $revokedRefresh = $this->refreshTokens->revokeSubject($user->subject_id);
        foreach ($this->sessionIds($user->subject_id, $session->session_id) as $sessionId) {
            $this->accessTokens->revokeSession($sessionId);
        }
        DB::table('sso_sessions')
            ->where('subject_id', $user->subject_id)
            ->where('session_id', '!=', $session->session_id)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => $changedAt]);

        $this->audits->append([
            'taxonomy' => 'profile.password_changed',
            'action' => 'profile.password.change',
            'outcome' => 'success',
            'admin_subject_id' => $user->subject_id,
            'admin_email' => null,
            'admin_role' => 'self-service-user',
            'method' => $request->method(),
            'path' => $request->path(),
            'ip_address' => $request->ip(),
            'reason' => 'self_service_password_change',
            'context' => [
                'revoked_refresh_tokens' => count($revokedRefresh),
                'request_id' => $request->headers->get('X-Request-Id'),
            ],
        ]);

        return response()->json([
            'message' => 'Password berhasil diubah.',
            'changed_at' => $changedAt->toIso8601String(),
            'other_sessions_revoked' => true,
        ]);
    }

    /**
     * @return list<string>
     */
    private function sessionIds(string $subjectId, string $currentSessionId): array
    {
        $oauthSessionIds = DB::table('refresh_token_rotations')
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->pluck('session_id')
            ->filter(fn (mixed $value): bool => is_string($value) && $value !== '')
            ->map(fn (mixed $value): string => (string) $value)
            ->all();

        return array_values(array_unique([$currentSessionId, ...$oauthSessionIds]));
    }
}
