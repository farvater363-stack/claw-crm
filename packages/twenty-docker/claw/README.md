# Claw CRM production deploy

One DigitalOcean Droplet (Ubuntu 24.04, 4 GB / 2 vCPU) running Caddy, the Twenty server and worker, Postgres 16 and Redis with Docker Compose. Caddy gets the HTTPS certificates for both domains automatically and also serves the public ProfMet site. `.github/workflows/cd-claw-image.yaml` builds both images on every merge to main: the server as `ghcr.io/farvater363-stack/claw-crm`, and Caddy with the site baked in as `ghcr.io/farvater363-stack/claw-web`.

## 1. Domain

Add an **A record** for the domain (for example `crm.example.com`) pointing at the Droplet's IPv4 address. Wait until `dig +short crm.example.com` returns that address before step 5, or Caddy cannot get a certificate.

## 2. Harden the Droplet

As root over SSH:

```bash
adduser --disabled-password --gecos "" claw
usermod -aG sudo claw
rsync --archive --chown=claw:claw ~/.ssh /home/claw
echo "claw ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/claw
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
apt-get update && apt-get -y upgrade && apt-get -y install unattended-upgrades
```

Check that `ssh claw@<ip>` works in a second terminal before closing the root session.

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker claw
```

Log out and back in so the group change applies.

## 4. Copy the files

```bash
sudo mkdir -p /opt/claw && sudo chown claw:claw /opt/claw && cd /opt/claw
for file in docker-compose.yml Caddyfile .env.example backup.sh; do
  curl -fsSLO "https://raw.githubusercontent.com/farvater363-stack/claw-crm/main/packages/twenty-docker/claw/$file"
done
chmod +x backup.sh
cp .env.example .env && chmod 600 .env
```

Edit `.env`: set `DOMAIN`, and fill `PG_DATABASE_PASSWORD` and `ENCRYPTION_KEY` with the output of `openssl rand -hex 32` (a different value each). Keep a copy of `ENCRYPTION_KEY` in your password manager: without it, a restored database cannot decrypt stored secrets.

## 5. Start

```bash
docker compose pull && docker compose up -d
docker compose ps
```

If the pull is refused, the image is still private: on GitHub open the `claw-crm` package settings and change its visibility to public.

Open `https://<domain>` **right away** and sign up: the first sign-up creates the workspace and its admin. After that, new people can only join by invitation.

## 6. Install the Claw app

In the workspace: Settings → APIs & Webhooks → create an API key. On your Mac, from `packages/twenty-apps/claw`:

```bash
yarn twenty remote:add --as claw-prod --url https://<domain> --api-key <key>
yarn twenty remote:use claw-prod
yarn twenty plan
yarn twenty apply
yarn twenty remote:use claw-local
```

Switch back to `claw-local` immediately: the default remote is shared by every local session.

Then, with `TWENTY_API_URL=https://<domain>` and `TWENTY_API_KEY=<key>` set, run `scripts/setup-owner-dashboard.py` and `scripts/import-excel.py` (see `packages/twenty-apps/claw/scripts/README.md`). Use `--dry-run` first.

## 7. Staff

Invite each person from Settings → Members and assign their role: Менеджер, Замерщик or Цех. Set each master's pay rate and late penalty in «Мастера» (new masters start at 0).

## 8. Backups

```bash
echo "0 2 * * * /opt/claw/backup.sh >> /var/log/claw-backup.log 2>&1" | crontab -
sudo touch /var/log/claw-backup.log && sudo chown claw /var/log/claw-backup.log
sudo mkdir -p /var/backups/claw && sudo chown claw /var/backups/claw
/opt/claw/backup.sh
```

Backups stay 14 days in `/var/backups/claw`. For an off-site copy, fill the `BACKUP_S3_*` lines in `.env` with a Spaces bucket and add a lifecycle rule on the bucket to expire old files. Also turn on Droplet backups in the DigitalOcean dashboard.

Test a restore before going live, on a scratch Droplet or after a test run:

```bash
docker compose stop server worker
docker compose exec -T db pg_restore -U postgres -d default --clean --if-exists < /var/backups/claw/db-<stamp>.dump
docker run --rm -v claw_server-local-data:/data -v /var/backups/claw:/backup alpine tar xzf /backup/files-<stamp>.tar.gz -C /data
docker compose up -d
```

## ProfMet site

The site source is in `site/` (see `site/README.md`). Caddy serves it on `SITE_DOMAIN` and redirects `www.` to it. Its estimate form posts to `/api/website/estimate`, which Caddy forwards to the Claw app's public route `/s/website/estimate` on the CRM, so a request becomes a «Новый» order with source «Сайт».

To turn it on:

1. Add **A records** for `SITE_DOMAIN` and `www.SITE_DOMAIN` pointing at the Droplet.
2. Set `SITE_DOMAIN` in `.env`, then fetch the current `docker-compose.yml` and `Caddyfile` again (step 4 commands).
3. Apply the Claw app (step 6) so the `website-catalog` and `website-estimate` routes exist. The monthly discount is the app variable «Скидка месяца на сайте, %» (`WEBSITE_OFFER_PERCENT`, default 10) in Settings → Applications → Claw CRM; `0` turns the offer off. It applies until the end of the current month and changes on the site within 5 minutes.
4. `docker compose pull && docker compose up -d`.

If `claw-web` is refused on pull, make the package public the same way as `claw-crm`.

## Updating

After a merge to main has built a new image:

```bash
cd /opt/claw && docker compose pull && docker compose up -d
```

The server applies database migrations on start, so run `/opt/claw/backup.sh` first. To roll back, set `TAG` in `.env` to the previous commit SHA and restore that pre-update backup as above: an older image may not run on a database a newer one migrated.

`TAG` pins both `claw-crm` and `claw-web`. `claw-web` exists only for commits from the ProfMet site onwards, so a rollback to an older commit also needs the older `docker-compose.yml` (plain `caddy:2`). When updating from a version without the site, fetch the new `docker-compose.yml` and `Caddyfile` and add `SITE_DOMAIN` to `.env`; without it the site stays on `localhost` and the CRM works as before.
