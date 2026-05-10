<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $email = (string) config('sso.seed.admin_email', 'admin@example.test');
        $password = (string) config('sso.seed.admin_password', 'change-me-admin-password');
        $subjectId = (string) config('sso.seed.admin_subject_id', 'usr_admin');

        $this->call(RbacSeeder::class);

        User::query()->updateOrCreate(
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

        $this->call(PassportClientSeeder::class);
    }
}
