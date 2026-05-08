# Legacy `sso-kali` VPS Cleanup Runbook

## Goal

Safely retire the old `sso-kali-*` Docker Compose stack after production has moved
to `sso-backend-prod-*`.

This runbook is intentionally conservative for a multi-app VPS.

## Safety Principles

- Do **not** run `docker system prune` on the VPS.
- Do **not** delete legacy volumes or networks in the first cleanup pass.
- Verify `sso-backend-prod` does not use any `sso-kali` network or volume.
- Back up the legacy PostgreSQL volume before stopping containers.
- Stop only containers labelled with:

```text
com.docker.compose.project=sso-kali
```

## Script

Use:

```text
scripts/vps-cleanup-legacy-sso-kali.sh
```

The script defaults to dry-run/audit mode.

## Step 1 — Copy Script to VPS

From local machine:

```bash
scp scripts/vps-cleanup-legacy-sso-kali.sh tio@145.79.15.8:/tmp/vps-cleanup-legacy-sso-kali.sh
```

On VPS:

```bash
sudo install -m 0750 /tmp/vps-cleanup-legacy-sso-kali.sh /usr/local/sbin/vps-cleanup-legacy-sso-kali.sh
```

## Step 2 — Dry-Run Audit

Run first without `--execute`:

```bash
sudo /usr/local/sbin/vps-cleanup-legacy-sso-kali.sh
```

Expected behavior:

- Lists `sso-kali` containers.
- Lists `sso-backend-prod` containers.
- Lists legacy networks/volumes.
- Fails closed if any production container uses a legacy network or volume.
- Prints recent legacy logs for context.
- Shows the backup path it would create.
- Shows which containers it would stop.

## Step 3 — Execute Backup + Stop

Only after dry-run passes:

```bash
sudo /usr/local/sbin/vps-cleanup-legacy-sso-kali.sh --execute
```

Expected behavior:

- Creates backup under:

```text
/opt/sso-backend-prod/backups/legacy-sso-kali
```

- Stops running legacy `sso-kali` containers only.
- Leaves volumes and networks intact for rollback.

## Step 4 — Verify Production

```bash
curl -fsS https://api-sso.timeh.my.id/up
curl -fsS https://api-sso.timeh.my.id/ready
sudo docker ps --filter 'name=sso-backend-prod'
```

Expected:

- `/up` returns success.
- `/ready` returns ready.
- `sso-backend-prod-*` containers remain running/healthy.
- `sso-kali-*` containers are stopped.

## Rollback

Because the first pass does not delete volumes/networks, rollback is simply
starting the legacy containers again if required:

```bash
sudo docker start sso-kali-postgres-1 sso-kali-redis-1
```

If the legacy compose file is still available, prefer:

```bash
cd /opt/sso-kali
sudo docker compose --env-file .env.prod -f docker-compose.main.yml up -d
```

## When to Delete Legacy Volumes

Do not delete legacy volumes immediately.

Recommended wait period:

```text
7-14 days after production remains stable
```

Before deletion:

- Confirm backups are restorable.
- Confirm no production service mounts legacy volumes.
- Confirm no pending rollback requirement.
- Record the deletion in an ops/audit note.

## Anti-Pattern: Do Not Use Prune

Do not run:

```bash
docker system prune -a --volumes
```

Reason:

- The VPS hosts multiple apps.
- Prune can delete unrelated images, networks, cache, and volumes.
- Recovery can be slow and unsafe during production operations.
