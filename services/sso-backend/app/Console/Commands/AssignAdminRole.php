<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

final class AssignAdminRole extends Command
{
    protected $signature = 'admin:assign-role {email? : Email to promote} {--list : Show current admins}';

    protected $description = 'Assign the admin role to a user by email, or list current admins';

    public function handle(): int
    {
        if ($this->option('list')) {
            return $this->listAdmins();
        }

        $email = (string) $this->argument('email');

        if ($email === '') {
            $this->error('Please provide an email address.');

            return self::FAILURE;
        }

        $user = User::query()->where('email', $email)->first();

        if ($user instanceof User) {
            $user->role = 'admin';
            $user->save();
            $this->info("✓ Admin role assigned to {$user->email} (Subject ID: {$user->subject_id})");
        } else {
            $this->warn("User '{$email}' hasn't logged in yet.");
            $this->info('The admin role will be auto-assigned on first login via ADMIN_PANEL_ADMIN_EMAIL config.');
        }

        return self::SUCCESS;
    }

    private function listAdmins(): int
    {
        $admins = User::query()->where('role', 'admin')->get(['email', 'display_name', 'subject_id']);

        if ($admins->isEmpty()) {
            $this->info('No admin users found.');

            return self::SUCCESS;
        }

        $this->table(
            ['Email', 'Display Name', 'Subject ID'],
            $admins->map(fn (User $u): array => [$u->email, $u->display_name, $u->subject_id]),
        );

        return self::SUCCESS;
    }
}
