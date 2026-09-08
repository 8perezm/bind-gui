# Operations

Day-to-day notes for running the stack in production. All paths below are
on the Docker host unless marked otherwise.

## Backups

Back up the whole `bind/config/` directory **plus** any `*.jnl` journal
files in it (see [Journal files](#journal-files)). Flush pending dynamic
updates to disk first so the zone files are current:

```bash
docker exec bind9-gui rndc -s bind9 -k /etc/bind/bind-gui.key sync -clean
```

> **Important:** never store backup copies *inside* `bind/config/`. The GUI
> lists every file matching `db.*` as a zone, so a file like
> `db.example.com.bak-20240101` shows up as a bogus zone and operations
> against it (sync, delzone) will fail or, worse, be applied to the wrong
> name. Keep backups in a separate directory the containers don't mount.

## File ownership

Two different users write into `bind/config/`:

| Writer | UID in container | Host owner | Files |
|--------|------------------|------------|-------|
| GUI (Next.js) | `0` (root) | `root` | Zone files and `named.conf.local` on create/delete |
| BIND (`named -u bind`) | `101` | `101` | `*.jnl` journals, zone files after `sync` |

New zone files therefore arrive `root`-owned, which blocks host-side edits
by your normal user and can block journal creation for that zone. After
creating a zone, normalise ownership and keep group/other write so both
writers keep working:

```bash
docker exec -u 0 bind9-gui chown 1000:1000 /app/bind/config/db.example.com
chmod 666 bind/config/db.example.com
```

To avoid the drift entirely, run the GUI as a non-root user matching your
host UID (the image has a `node` user at UID 1000):

```yaml
services:
  bind-gui:
    user: "1000:1000"
    group_add:
      - "<host-docker-gid>"  # so the /var/run/docker.sock mount keeps working
```

Find the gid with `stat -c '%g' /var/run/docker.sock` on the host.

## Reading BIND logs

`docker logs bind9` is intentionally empty: the image starts
`named -f -c /etc/bind/named.conf -L /var/log/bind/default.log`, so all
BIND output goes to that file inside an anonymous volume — not stdout.
Read it with:

```bash
docker cp bind9:/var/log/bind/default.log - | tr -d '\000' | tail -n 50
```

(`tr` strips the null padding `docker cp` adds to the tar stream.)
Look for `update-security` / `update:` lines for dynamic-update failures
and `zoneload:` lines for zone load errors at startup/reconfig.

## Journal files

On the first dynamic update to a zone, BIND creates a binary journal next
to the zone file:

- In the container: `/etc/bind/<zone>.jnl`
- On the host: `bind/config/<zone>.jnl`
- In the GUI container: `/app/bind/config/<zone>.jnl`

Journals hold updates not yet flushed to the zone file. The GUI runs
`rndc sync` before reading a zone, so the file you see is current — but
always back up the `.jnl` together with its zone file and restore them as
a set. Never hand-edit a journal; to discard one, use
`rndc sync -clean <zone>`.

## Zone prerequisites

Every master zone file needs at least an `SOA` and one `NS` record.
A file with only `A` records fails to load with `has no NS records`
(`not loaded due to errors`), while the other zones keep serving — easy
to miss if you only check container health.
