<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'subject_id' => fake()->unique()->numerify('subject-##########'),
            'email' => fake()->unique()->safeEmail(),
            'display_name' => fake()->name(),
            'last_synced_at' => now(),
        ];
    }
}
