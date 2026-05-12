<?php

declare(strict_types=1);

namespace App\Http\Controllers\Resource;

use App\Models\User;
use App\Services\Session\SsoSessionCookieResolver;
use App\Services\Session\SsoSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

final class ChangePasswordController
{
    public function __construct(
        private readonly SsoSessionCookieResolver $cookies,
        private readonly SsoSessionService $sessionService,
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

        $validator = Validator::make($request->all(), [
            'current_password' => ['required', 'string'],
            'new_password' => ['required', 'string', 'min:8', 'confirmed'],
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

        // Update password with Argon2id
        $user->password = Hash::make($request->input('new_password'));
        $user->save();

        return response()->json([
            'message' => 'Password berhasil diubah.',
            'changed_at' => now()->toIso8601String(),
        ]);
    }
}
