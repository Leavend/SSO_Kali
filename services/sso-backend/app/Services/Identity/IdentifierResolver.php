<?php

declare(strict_types=1);

namespace App\Services\Identity;

use Illuminate\Support\Str;

final class IdentifierResolver
{
    /**
     * @param  list<string>  $matches
     */
    public function loginHint(string $input, array $matches): string
    {
        $this->parse($input);
        $candidates = array_values(array_unique(array_filter($matches, $this->stringFilter(...))));

        return match (count($candidates)) {
            1 => $candidates[0],
            0 => throw IdentifierResolutionException::invalidCredentials(),
            default => throw IdentifierResolutionException::ambiguousIdentifier(),
        };
    }

    public function parse(string $input): ResolvedIdentifier
    {
        $normalized = $this->normalize($input);

        return $this->email($normalized)
            ?? $this->nisn($normalized)
            ?? $this->nip($normalized)
            ?? $this->username($normalized)
            ?? throw IdentifierResolutionException::invalidCredentials();
    }

    private function email(string $value): ?ResolvedIdentifier
    {
        if (substr_count($value, '@') !== 1 || filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
            return null;
        }

        return new ResolvedIdentifier(IdentifierType::Email, Str::lower($value));
    }

    private function nisn(string $value): ?ResolvedIdentifier
    {
        $digits = $this->numericAlias($value);

        return $digits !== null && strlen($digits) === 10
            ? new ResolvedIdentifier(IdentifierType::Nisn, $digits)
            : null;
    }

    private function nip(string $value): ?ResolvedIdentifier
    {
        $digits = $this->numericAlias($value);

        return $digits !== null && strlen($digits) === 18
            ? new ResolvedIdentifier(IdentifierType::Nip, $digits)
            : null;
    }

    private function username(string $value): ?ResolvedIdentifier
    {
        $candidate = Str::lower($value);

        if (str_contains($candidate, '@') || ctype_digit($candidate)) {
            return null;
        }

        return preg_match('/^[a-z0-9._-]{3,64}$/', $candidate) === 1
            ? new ResolvedIdentifier(IdentifierType::Username, $candidate)
            : null;
    }

    private function normalize(string $value): string
    {
        $trimmed = trim($value);

        if (! class_exists(\Normalizer::class)) {
            return $trimmed;
        }

        return (string) \Normalizer::normalize($trimmed, \Normalizer::FORM_KC);
    }

    private function numericAlias(string $value): ?string
    {
        $candidate = preg_replace('/[\s.\-]/u', '', $value);

        if (! is_string($candidate) || $candidate === '' || preg_match('/^[0-9]+$/', $candidate) !== 1) {
            return null;
        }

        return $candidate;
    }

    private function stringFilter(mixed $value): bool
    {
        return is_string($value) && $value !== '';
    }
}
