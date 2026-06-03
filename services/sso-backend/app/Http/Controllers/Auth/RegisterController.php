<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Models\Role;
use App\Models\User;
use App\Rules\StrongPassword;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

final class RegisterController
{
    public function __invoke(Request $request): JsonResponse
    {
        $validator = Validator::make($request->only(['name', 'email', 'password', 'password_confirmation']), [
            'name' => ['required', 'string', 'min:2', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', new StrongPassword, 'confirmed'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Data yang diberikan tidak valid.',
                'errors' => $validator->errors()->toArray(),
            ], 422);
        }

        $validated = $validator->validated();

        $user = User::create([
            'subject_id' => Str::uuid()->toString(),
            'subject_uuid' => Str::uuid()->toString(),
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'display_name' => $validated['name'],
            'given_name' => $validated['name'],
            'role' => 'user',
            'status' => 'active',
            'local_account_enabled' => true,
        ]);

        $userRole = Role::query()->where('slug', 'user')->first();
        if ($userRole instanceof Role) {
            $user->roles()->syncWithoutDetaching([$userRole->id]);
        }

        return response()->json([
            'message' => 'Akun berhasil dibuat.',
            'user' => [
                'id' => $user->subject_id,
                'email' => $user->email,
                'display_name' => $user->display_name,
            ],
        ], 201);
    }
}
