<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Models\User;
use App\Rules\StrongPassword;
use App\Support\Admin\SingleRoleAssignment;
use App\Support\Profile\NameComposer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

final class RegisterController
{
    public function __construct(
        private readonly SingleRoleAssignment $singleRoleAssignment,
    ) {}

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
        $name = (string) $validated['name'];
        $names = NameComposer::derive($name);
        $displayName = NameComposer::compose($names['given_name'], $names['family_name']);

        // Create user and assign role atomically: if either fails, both rollback
        $user = DB::transaction(function () use ($validated, $displayName, $name, $names): User {
            $user = User::create([
                'subject_id' => Str::uuid()->toString(),
                'subject_uuid' => Str::uuid()->toString(),
                'email' => $validated['email'],
                'password' => Hash::make($validated['password']),
                'display_name' => $displayName !== '' ? $displayName : $name,
                'given_name' => $names['given_name'],
                'family_name' => $names['family_name'],
                'role' => 'user',
                'status' => 'active',
                'local_account_enabled' => true,
            ]);

            // Route through SingleRoleAssignment to enforce pivot ↔ column mirror invariant
            $this->singleRoleAssignment->assign($user, 'user');

            return $user;
        });

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
