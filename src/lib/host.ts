import { isPackSlug } from "../packs/registry.ts";

/**
 * Hostname -> pack mapping for subdomain routing (GamePlan.md Section 4).
 *
 * Lives apart from `src/proxy.ts` so it can be tested without pulling in the
 * Next runtime — which matters here, because there is no domain or DNS to
 * test against yet and this pure function is the whole of the routing rule.
 *
 * Adding a pack needs no change: the first label of the hostname is looked up
 * in the registry, so `insects.example.com` starts working the moment the
 * `insects` slug exists.
 */
export function packSlugForHost(host: string | null): string | null {
  if (!host) return null;

  // Strip the port, lower-case, drop the trailing dot of an absolute FQDN.
  const hostname = host.split(":")[0].toLowerCase().replace(/\.$/, "");
  const labels = hostname.split(".");

  // A single-label host ("localhost") has no parent domain, so its one label
  // is the site itself rather than a subdomain of anything.
  if (labels.length < 2) return null;

  return isPackSlug(labels[0]) ? labels[0] : null;
}
