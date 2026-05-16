<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use App\Support\Rbac\AdminPermission;
use Illuminate\Database\Seeder;

final class RbacSeeder extends Seeder
{
    public function run(): void
    {
        $permissions = collect(AdminPermission::all())
            ->mapWithKeys(fn (string $slug): array => [$slug => $this->permission($slug)]);

        $permissions->each(
            fn (array $attributes, string $slug): Permission => Permission::query()->updateOrCreate(
                ['slug' => $slug],
                $attributes,
            ),
        );

        $admin = $this->role('admin', 'Administrator', 'Full SSO administration role.');
        $user = $this->role('user', 'User', 'Default least-privilege user role.');

        $admin->permissions()->sync(
            Permission::query()->whereIn('slug', AdminPermission::adminDefaults())->pluck('id')->all(),
        );

        $user->permissions()->sync(
            Permission::query()->whereIn('slug', AdminPermission::userDefaults())->pluck('id')->all(),
        );

        $catalog = [
            ['slug' => 'auditor', 'name' => 'Auditor', 'description' => 'Read-only auditor with audit export rights.'],
            ['slug' => 'support', 'name' => 'Support', 'description' => 'Support staff with read-only user/session/audit visibility.'],
            ['slug' => 'client-manager', 'name' => 'Client Manager', 'description' => 'Manages OIDC clients and external IdPs.'],
            ['slug' => 'security-officer', 'name' => 'Security Officer', 'description' => 'Incident responder with session termination, user lock, and DSR review.'],
        ];

        foreach ($catalog as $entry) {
            $role = $this->role($entry['slug'], $entry['name'], $entry['description']);
            $role->permissions()->sync(
                Permission::query()
                    ->whereIn('slug', AdminPermission::leastPrivilegeRoleCatalog()[$entry['slug']])
                    ->pluck('id')
                    ->all(),
            );
        }
    }

    /**
     * @return array{name: string, description: string, category: string}
     */
    private function permission(string $slug): array
    {
        return [
            'name' => str($slug)->replace('.', ' ')->title()->toString(),
            'description' => "Allows {$slug} capability.",
            'category' => str($slug)->before('.')->toString(),
        ];
    }

    private function role(string $slug, string $name, string $description): Role
    {
        return Role::query()->updateOrCreate(
            ['slug' => $slug],
            ['name' => $name, 'description' => $description, 'is_system' => true],
        );
    }
}
