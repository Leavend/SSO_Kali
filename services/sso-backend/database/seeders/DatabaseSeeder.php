<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use App\Support\Admin\SingleRoleAssignment;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function __construct(
        private readonly SingleRoleAssignment $singleRoleAssignment,
    ) {}

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call(RbacSeeder::class);

        $email = (string) config('sso.seed.admin_email', 'admin@example.test');
        $password = (string) config('sso.seed.admin_password', 'change-me-admin-password');
        $subjectId = (string) config('sso.seed.admin_subject_id', 'usr_admin');

        $adminUser = User::query()->updateOrCreate(
            ['email' => $email],
            [
                'subject_id' => $subjectId,
                'password' => $password,
                'given_name' => 'SSO',
                'family_name' => 'Admin',
                'display_name' => 'SSO Admin',
                'role' => 'admin',
                'email_verified_at' => now(),
            ],
        );

        // Route through SingleRoleAssignment to enforce pivot ↔ column mirror invariant
        $this->singleRoleAssignment->assign($adminUser, 'admin');

        $this->seedDsrAutomationUser();

        $this->call(PassportClientSeeder::class);
    }

    private function seedDsrAutomationUser(): void
    {
        $subjectId = (string) config('sso.seed.dsr_automation_subject_id', 'system-dsr-automation');
        $email = (string) config('sso.seed.dsr_automation_email', 'system-dsr-automation@example.invalid');

        $dsrUser = User::query()->updateOrCreate(
            ['subject_id' => $subjectId],
            [
                'email' => $email,
                'password' => null,
                'given_name' => 'System',
                'family_name' => 'DSR Automation',
                'display_name' => 'System DSR Automation',
                'role' => 'admin',
                'status' => 'active',
                'local_account_enabled' => false,
                'email_verified_at' => now(),
            ],
        );

        // Route through SingleRoleAssignment to enforce pivot ↔ column mirror invariant
        $this->singleRoleAssignment->assign($dsrUser, 'admin');
    }
}
