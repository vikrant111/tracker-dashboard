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

## 3. The database, without Docker

The dashboard needs MongoDB. It does **not** need Docker, and it does not need
you to install anything. Pick whichever of these your network allows.

### The easy one: a hosted cluster

Nothing installed, nothing running on your machine. [MongoDB
Atlas](https://www.mongodb.com/cloud/atlas/register) has a free tier that is
more than this dashboard needs.

1. Create a free **M0** cluster
2. **Database Access** → add a user with a password
3. **Network Access** → add your current IP
4. **Connect → Drivers** → copy the connection string

```bash
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.abcde.mongodb.net
MONGODB_DB=pod_tracker
```

That is the whole configuration. Collections and indexes are created on first
use; there is no migration step.

> **If the password contains `@ : / ? # %`** it must be percent-encoded in the
> connection string, or the driver reads it as part of the host. The app names
> this specifically when authentication fails, because it is the single most
> common setup mistake.

> **`mongodb+srv://` needs DNS SRV lookups**, which some corporate networks
> block. If it fails to resolve, Atlas will also give you a plain
> `mongodb://host1,host2,host3/…` string under *Connect → Drivers → older
> driver versions*. That form needs no SRV.

### The local one: no install, no Docker

If outbound port 27017 is blocked — common on a corporate network — run a real
MongoDB locally without installing it:

```bash
pnpm mongo:local
```

It downloads a `mongod` binary the first time (about 100 MB, cached under
`node_modules`) and runs it against `.mongo-data/` in the repo, so your data
survives restarts. Leave it in its own terminal — it is the database.

```bash
MONGODB_URI=mongodb://127.0.0.1:27017
```

That download goes through the same proxy as everything else, so if it fails,
fix the certificate in section 1 first.

### Or one somebody else runs

If your organisation already has a MongoDB, point at it and skip both:

```bash
MONGODB_URI=mongodb://mongo.internal.example:27017
MONGODB_DB=pod_tracker
MONGODB_COLLECTION_PREFIX=tracker
```

Collections are prefixed, so sharing a cluster with other applications is safe.
Pick a distinct prefix if you want to be certain.

### Why this is easier than it was

The app used to need MongoDB, which meant a JVM, a gigabyte of heap and
either Docker or a tarball. MongoDB replaced it precisely so that a locked-down
machine has a route in: **a URL in `.env.local` is the entire setup.**

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

The database is the one thing left: either a hosted cluster, or `pnpm mongo:local`
(whose binary download you can also carry over in `node_modules`).

---

## The whole thing, in order

```bash
git clone …  &&  cd tracker
cp .env.example .env.local

pnpm check:env                    # what is broken here, and how to fix it

# whatever it told you, then:
pnpm install
echo 'FONT_SOURCE=local' >> .env.local     # if Google is unreachable
pnpm mongo:local &                          # if you have no database
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
| `pnpm seed` fails instantly | The database is unreachable | Run `pnpm check:env` — it names which of the four things is wrong |
| `mongodb+srv://` will not resolve | The network blocks DNS SRV | Use the plain `mongodb://host1,host2,host3/…` form Atlas also offers |
| Works in dev, fails in `pnpm build` | `FONT_SOURCE` set in the shell but not `.env.local` | Put it in `.env.local` |
| Certificate error only in `pnpm build` | `NODE_EXTRA_CA_CERTS` not exported in that shell | Add it to your shell profile |
