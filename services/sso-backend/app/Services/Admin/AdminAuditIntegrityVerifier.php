<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\AdminAuditEvent;

final class AdminAuditIntegrityVerifier
{
    public function __construct(
        private readonly AdminAuditEventStore $store,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function verify(): array
    {
        $events = AdminAuditEvent::query()->orderBy('id')->get();
        $previousHash = null;
        $firstEventId = null;
        $lastEventId = null;
        $lastEventHash = null;

        foreach ($events as $event) {
            $firstEventId ??= $event->event_id;
            $lastEventId = $event->event_id;
            $lastEventHash = $event->event_hash;

            if ($event->previous_hash !== $previousHash || $this->store->hash($this->record($event), $event->signing_key_id) !== $event->event_hash) {
                return $this->result(false, $events->count(), $firstEventId, $lastEventId, $lastEventHash, $event->event_id);
            }

            $previousHash = $event->event_hash;
        }

        return $this->result(true, $events->count(), $firstEventId, $lastEventId, $lastEventHash, null);
    }

    /**
     * @return array<string, mixed>
     */
    private function record(AdminAuditEvent $event): array
    {
        return [
            'event_id' => $event->event_id,
            'action' => $event->action,
            'outcome' => $event->outcome,
            'taxonomy' => $event->taxonomy,
            'admin_subject_id' => $event->admin_subject_id,
            'admin_email' => $event->admin_email,
            'admin_role' => $event->admin_role,
            'method' => $event->method,
            'path' => $event->path,
            'ip_address' => $event->ip_address,
            'reason' => $event->reason,
            'context' => $event->context,
            'occurred_at' => $event->occurred_at,
            'previous_hash' => $event->previous_hash,
            'signing_key_id' => $event->signing_key_id,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function result(
        bool $valid,
        int $checkedEvents,
        ?string $firstEventId,
        ?string $lastEventId,
        ?string $lastEventHash,
        ?string $brokenEventId,
    ): array {
        return [
            'valid' => $valid,
            'checked_events' => $checkedEvents,
            'first_event_id' => $firstEventId,
            'last_event_id' => $lastEventId,
            'last_event_hash' => $lastEventHash,
            'broken_event_id' => $brokenEventId,
        ];
    }
}
