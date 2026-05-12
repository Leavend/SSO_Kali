<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\User;
use App\Services\Directory\DirectoryUserProvider;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * UserPrincipalResource — kontrak DTO stabil untuk FE portal.
 *
 * Shape ini dijamin konsisten di semua endpoint yang mengembalikan
 * user principal (login, session inspect). FE type `SsoUser` di
 * `types/auth.types.ts` harus match 1:1 dengan output ini.
 *
 * @mixin User
 */
final class UserPrincipalResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $this->resource;

        return [
            'id' => (int) $user->getKey(),
            'subject_id' => $user->subject_id,
            'email' => $user->email,
            'display_name' => $user->display_name,
            'roles' => app(DirectoryUserProvider::class)->rolesFor($user->subject_id),
        ];
    }
}
