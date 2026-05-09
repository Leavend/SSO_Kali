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
        $email = (string) env('SSO_ADMIN_EMAIL', 'admin@example.test');
        $password = (string) env('SSO_ADMIN_PASSWORD', 'change-me-admin-password');

        $this->call(RbacSeeder::class);

        User::query()->updateOrCreate(
            ['email' => $email],
            [
                'subject_id' => env('SSO_ADMIN_SUBJECT_ID', 'usr_admin'),
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
