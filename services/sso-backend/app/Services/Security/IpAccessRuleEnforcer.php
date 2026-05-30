<?php

declare(strict_types=1);

namespace App\Services\Security;

use App\Exceptions\IpAccessDeniedException;
use App\Models\IpAccessRule;

final class IpAccessRuleEnforcer
{
    /**
     * Enforce IP access rules against the given IP address.
     *
     * @throws IpAccessDeniedException
     */
    public function enforce(string $ip): void
    {
        /** @var list<IpAccessRule> $rules */
        $rules = IpAccessRule::active()->get()->all();

        if ($rules === []) {
            return;
        }

        // Block rules take precedence: if any block rule matches, deny immediately.
        foreach ($rules as $rule) {
            if ($rule->mode === 'block' && $this->matches($ip, $rule->cidr)) {
                throw new IpAccessDeniedException($ip, $rule->reason ?? 'Blocked by IP access rule.');
            }
        }

        // Allow rules: if any allow rule matches, permit early.
        foreach ($rules as $rule) {
            if ($rule->mode === 'allow' && $this->matches($ip, $rule->cidr)) {
                return;
            }
        }
    }

    /**
     * Check if an IP address matches a CIDR range.
     */
    public function matches(string $ip, string $cidr): bool
    {
        $parts = explode('/', $cidr, 2);
        $subnetIp = $parts[0];
        $prefix = isset($parts[1]) ? (int) $parts[1] : 32;

        $ipBin = inet_pton($ip);
        $subnetBin = inet_pton($subnetIp);

        if ($ipBin === false || $subnetBin === false) {
            return false;
        }

        $ipLen = strlen($ipBin);

        $mask = str_repeat("\xff", intdiv($prefix, 8));
        if ($prefix % 8 !== 0) {
            $mask .= chr(0xFF << (8 - $prefix % 8) & 0xFF);
        }
        $mask = str_pad($mask, $ipLen, "\x00");

        return ($ipBin & $mask) === ($subnetBin & $mask);
    }
}
