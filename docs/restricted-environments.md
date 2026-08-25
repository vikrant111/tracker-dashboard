# Running it on a machine you do not control

Corporate laptop, no admin rights, no Docker, a proxy that inspects TLS. All of
that is workable. This page is the order to do it in.

**Start here.** It tells you which of these sections you actually need:

```bash
pnpm check:env
```

It changes nothing, needs no network, and runs before `pnpm install` has
finished. Every failure it prints comes with the fix.

---

## 1. The certificate error

> `unable to get local issuer certificate`
> `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` · `SELF_SIGNED_CERT_IN_CHAIN`

### Why the browser works and the build does not

Your organisation terminates TLS at a proxy, inspects the traffic, and re-signs
it with a private CA. Chrome trusts that CA because IT installed it in the
**system** trust store.

**Node ships its own CA bundle and never looks at the system store.** So `pnpm
install`, `next build` and every `fetch` see a certificate signed by an authority
they have never heard of, and refuse it. Nothing is broken and nothing is
misconfigured — Node is doing exactly what it should.

### The fix

Point Node at your organisation's root CA:

```bash
export NODE_EXTRA_CA_CERTS=/absolute/path/to/corporate-ca.pem
```

Put that line in `~/.zshrc`, `~/.bashrc` or the Windows environment variables so
it survives a new terminal. To get the file:

| | |
|---|---|
| **macOS** | `security find-certificate -a -p /Library/Keychains/System.keychain > corp-ca.pem` |
| **Windows** | Certificate Manager (`certmgr.msc`) → Trusted Root → find the proxy CA → export as **Base-64 X.509 (.CER)** |
| **Linux** | Usually already at `/etc/ssl/certs/ca-certificates.crt` |

If you cannot identify which certificate is the proxy's, ask IT for *"the root
CA certificate for the TLS inspection proxy"*. It is not a secret — it is
already on every machine in the building.

### pnpm needs telling separately

pnpm does not always read `NODE_EXTRA_CA_CERTS`:

```bash
pnpm config set cafile /absolute/path/to/corporate-ca.pem
```

If your organisation runs an internal registry mirror, use it — it is usually
excluded from inspection:

```bash
pnpm config set registry https://your-internal-mirror/
```

### What not to do

```bash
export NODE_TLS_REJECT_UNAUTHORIZED=0   # ← don't
```

That disables certificate verification for **every** connection the process
makes, including the ones carrying your Azure personal access token to
`dev.azure.com`. It turns one build problem into a standing credential exposure.
Use it to confirm a diagnosis for thirty seconds if you must, then unset it.

---

## 2. Fonts, without reaching Google

The default build downloads three typefaces from Google at **build time** and
self-hosts them. That download is what fails behind the proxy.

Fixing the certificate above fixes this too. If you would rather not depend on
the network at all — or your allowlist blocks `fonts.googleapis.com` outright —
the font files are already committed to this repository:

```bash
echo 'FONT_SOURCE=local' >> .env.local
```

| `FONT_SOURCE` | Fetches at build | Ships font files | Looks like |
|---|---|---|---|
| `google` *(default)* | yes | yes, after download | the design |
| **`local`** | **no** | yes, from `src/fonts/files/` | **identical** |
| `system` | no | no | plainer, fully usable |

`local` renders identically to `google` because the committed files *are* the
Google files — the same `latin` subset, about 140 KB, refreshed with:

```bash
pnpm fonts:vendor     # run on a machine that CAN reach Google, then commit
```

`system` is the floor. It ships no fonts and cannot fail, because there is
nothing for a proxy to intercept. Every rule in `globals.css` already names a
real fallback after its variable, so nothing looks broken — just plainer.

> **Verified:** with all outbound HTTPS pointed at a dead proxy, `local` and
> `system` both build cleanly with **zero** network attempts, and `local` emits
> all five `.woff2` files into `.next/static`.

---

## 3. OpenSearch, without Docker

The dashboard cannot run without OpenSearch. `docker compose up` is the
convenience, not the requirement.

### Run it from the tarball

No admin rights, no daemon, no install — and it bundles its own Java, so you do
not need a JDK either.

1. Download the `tar.gz` (Linux/macOS) or `.zip` (Windows) from
   [opensearch.org/downloads](https://opensearch.org/downloads.html)
2. Unpack it anywhere you can write
3. In `config/opensearch.yml`, add:

   ```yaml
   discovery.type: single-node
   plugins.security.disabled: true
   ```

4. Start it:

   ```bash
   ./bin/opensearch          # Windows: bin\opensearch.bat
   ```

5. Confirm, in another terminal:

   ```bash
   curl localhost:9200
   ```

Leave that terminal running — it is the database. `OPENSEARCH_URL` already
defaults to `http://localhost:9200`, so there is nothing to configure.

> Disabling the security plugin is right for a local single node on your own
> machine and wrong for anything shared. For a shared instance, leave it on and
> set `OPENSEARCH_USERNAME` / `OPENSEARCH_PASSWORD`.

### Or use one somebody else runs

If your organisation already has an OpenSearch or Elasticsearch cluster, point
at it and skip the download entirely:

```bash
OPENSEARCH_URL=https://opensearch.internal.example
OPENSEARCH_USERNAME=…
OPENSEARCH_PASSWORD=…
```

Indices are created on first run and prefixed with `OPENSEARCH_INDEX_PREFIX`
(default `tracker`), so sharing a cluster with other applications is safe. Pick
a distinct prefix if you want to be sure.

### Memory

The tarball defaults to a 1 GB heap and will not start on a machine that cannot
give it that. To lower it, edit `config/jvm.options`:

```
-Xms512m
-Xmx512m
```

---

## 4. Getting the code there

If `git clone` fails on the same certificate problem:

```bash
git config --global http.sslCAInfo /absolute/path/to/corporate-ca.pem
```

Never `git config --global http.sslVerify false` — same objection as
`NODE_TLS_REJECT_UNAUTHORIZED=0`, and it applies to every repository you ever
clone on that machine.

### If the machine has no internet at all

Build the dependency store on a machine that does, and carry it over:

```bash
# on the connected machine
pnpm install
pnpm fonts:vendor
tar czf tracker-offline.tgz node_modules src/fonts/files

# on the locked-down machine, in the repo
tar xzf tracker-offline.tgz
echo 'FONT_SOURCE=local' >> .env.local
pnpm build --offline
```

You will still need the OpenSearch tarball, which is a single download.

---

## The whole thing, in order

```bash
git clone …  &&  cd tracker
cp .env.example .env.local

pnpm check:env                    # what is broken here, and how to fix it

# whatever it told you, then:
pnpm install
echo 'FONT_SOURCE=local' >> .env.local     # if Google is unreachable
./opensearch-*/bin/opensearch &             # if you have no Docker
pnpm seed                                   # sample data, no Azure needed
pnpm dev
```

`pnpm check:env` again at the end. It should be all green before you expect
`pnpm dev` to work.

---

## Things that will still bite

| Symptom | Cause | Fix |
|---|---|---|
| `pnpm install` hangs, no error | Proxy needs authentication | `export HTTPS_PROXY=http://user:pass@proxy:port` |
| Build succeeds, fonts look wrong | `FONT_SOURCE=local` with no files committed | `pnpm fonts:vendor`, or use `system` |
| `pnpm seed` fails instantly | OpenSearch not up yet | Wait ~30s after starting it, `curl localhost:9200` |
| OpenSearch exits immediately | Not enough heap | Lower `-Xmx` in `config/jvm.options` |
| Works in dev, fails in `pnpm build` | `FONT_SOURCE` set in the shell but not `.env.local` | Put it in `.env.local` |
| Certificate error only in `pnpm build` | `NODE_EXTRA_CA_CERTS` not exported in that shell | Add it to your shell profile |
