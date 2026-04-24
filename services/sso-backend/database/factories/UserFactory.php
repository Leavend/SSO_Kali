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
        $subjectId = (string) fake()->unique()->numerify('3#################');

        return [
            'subject_id' => $subjectId,
            'subject_uuid' => $subjectId,
            'email' => fake()->unique()->safeEmail(),
            'given_name' => fake()->firstName(),
            'family_name' => fake()->lastName(),
            'display_name' => fake()->name(),
            'email_verified_at' => now(),
            'last_login_at' => now(),
        ];
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
