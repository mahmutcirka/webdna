import ipaddr from "ipaddr.js";

export interface IpClassification {
  address: string;
  allowed: boolean;
  /** ipaddr.js range name, e.g. "unicast", "private", "loopback", "linkLocal". */
  range: string;
}

/**
 * Only globally routable unicast addresses are allowed. Everything else — private,
 * loopback, link-local (incl. 169.254.169.254 cloud metadata), CGNAT (incl.
 * 100.100.100.200), unique-local IPv6 (incl. fd00:ec2::254), multicast, reserved,
 * documentation, benchmarking and translation/tunnel prefixes that can embed an
 * internal IPv4 address — is blocked.
 */
export function classifyIp(address: string): IpClassification {
  if (!ipaddr.isValid(address)) return { address, allowed: false, range: "invalid" };
  let parsed = ipaddr.parse(address);

  if (parsed.kind() === "ipv6") {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      parsed = v6.toIPv4Address();
    }
  }

  const range = parsed.range();
  if (range !== "unicast") return { address, allowed: false, range };

  if (parsed.kind() === "ipv4") {
    // Ranges ipaddr.js labels "unicast" but which are not safely routable destinations.
    const extraBlocked: [string, number][] = [
      ["0.0.0.0", 8],
      ["192.0.0.0", 24], // IETF protocol assignments
      ["198.18.0.0", 15], // benchmarking
      ["192.0.2.0", 24], // TEST-NET-1
      ["198.51.100.0", 24], // TEST-NET-2
      ["203.0.113.0", 24], // TEST-NET-3
      ["240.0.0.0", 4], // reserved
    ];
    const v4 = parsed as ipaddr.IPv4;
    for (const [net, bits] of extraBlocked) {
      if (v4.match(ipaddr.IPv4.parse(net), bits))
        return { address, allowed: false, range: "reserved" };
    }
  } else {
    const v6 = parsed as ipaddr.IPv6;
    // Only the global unicast block 2000::/3 is acceptable for IPv6.
    if (!v6.match(ipaddr.IPv6.parse("2000::"), 3))
      return { address, allowed: false, range: "reserved" };
    const extraBlocked: [string, number][] = [
      ["2001:db8::", 32], // documentation
      ["2002::", 16], // 6to4 (embeds IPv4)
      ["2001::", 32], // Teredo (embeds IPv4)
      ["64:ff9b::", 96], // NAT64 (embeds IPv4)
      ["64:ff9b:1::", 48],
    ];
    for (const [net, bits] of extraBlocked) {
      if (v6.match(ipaddr.IPv6.parse(net), bits))
        return { address, allowed: false, range: "reserved" };
    }
  }
  return { address, allowed: true, range };
}

export function isIpLiteral(host: string): boolean {
  return ipaddr.isValid(stripBrackets(host));
}

export function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}
