<?php

declare(strict_types=1);

namespace App\Http\Controllers\Resource;

use App\Models\User;
use App\Services\Session\SsoSessionCookieResolver;
use App\Services\Session\SsoSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

final class ProfileUpdateController
{
    public function __construct(
        private readonly SsoSessionCookieResolver $cookies,
        private readonly SsoSessionService $sessionService,
    ) {}

    /**
     * PATCH /api/profile — update user profile fields.
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
            'display_name' => ['sometimes', 'string', 'max:100'],
            'given_name' => ['sometimes', 'nullable', 'string', 'max:50'],
            'family_name' => ['sometimes', 'nullable', 'string', 'max:50'],
        ], [
            'display_name.max' => 'Nama tampilan maksimal 100 karakter.',
            'given_name.max' => 'Nama depan maksimal 50 karakter.',
            'family_name.max' => 'Nama belakang maksimal 50 karakter.',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validasi gagal.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $validated = $validator->validated();

        if (isset($validated['display_name'])) {
            $user->display_name = $validated['display_name'];
        }
        if (array_key_exists('given_name', $validated)) {
            $user->given_name = $validated['given_name'];
        }
        if (array_key_exists('family_name', $validated)) {
            $user->family_name = $validated['family_name'];
        }

        $user->profile_synced_at = now();
        $user->save();

        return response()->json([
            'message' => 'Profil berhasil diperbarui.',
            'profile' => [
                'subject_id' => $user->subject_id,
                'display_name' => $user->display_name,
                'given_name' => $user->given_name,
                'family_name' => $user->family_name,
                'email' => $user->email,
                'email_verified' => $user->email_verified_at !== null,
                'status' => $user->status ?? 'active',
                'profile_synced_at' => $user->profile_synced_at?->toIso8601String(),
                'last_login_at' => $user->last_login_at?->toIso8601String(),
            ],
        ]);
    }
}
