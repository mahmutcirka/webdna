import { lookup } from "node:dns/promises";
import { ScanFailure } from "../errors.js";
import { classifyIp, isIpLiteral, stripBrackets } from "./ip.js";

export type Resolver = (hostname: string) => Promise<string[]>;

export const systemResolver: Resolver = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
};

export interface NetworkPolicyOptions {
  allowedPorts?: number[];
  /**
   * DANGEROUS, development/test only: exact "host:port" pairs that may resolve to
   * loopback. Used to scan local fixture sites. Never enable on a shared host.
   */
  unsafeAllowLoopback?: string[];
  resolver?: Resolver;
}

export interface ValidatedDestination {
  hostname: string;
  port: number;
  /** The address the connection must be pinned to. */
  address: string;
  family: 4 | 6;
}

export class NetworkPolicy {
  readonly allowedPorts: Set<number>;
  readonly unsafeAllowLoopback: Set<string>;
  private readonly resolver: Resolver;

  constructor(options: NetworkPolicyOptions = {}) {
    this.allowedPorts = new Set(options.allowedPorts ?? [80, 443, 8080, 8443]);
    this.unsafeAllowLoopback = new Set(
      (options.unsafeAllowLoopback ?? []).map((s) => s.toLowerCase()),
    );
    this.resolver = options.resolver ?? systemResolver;
  }

  /**
   * Resolve and validate a destination. Every resolved address must be public;
   * a mix of public and private records is rejected (a classic rebinding setup).
   * Callers must connect to the returned address, never re-resolve the name.
   */
  async validate(hostnameInput: string, port: number): Promise<ValidatedDestination> {
    const hostname = stripBrackets(hostnameInput.toLowerCase());
    const loopbackAllowed = this.unsafeAllowLoopback.has(`${hostname}:${port}`);

    if (!this.allowedPorts.has(port) && !loopbackAllowed) {
      throw new ScanFailure("blocked_destination", `Port ${port} is not allowed.`);
    }

    let addresses: string[];
    if (isIpLiteral(hostname)) {
      addresses = [hostname];
    } else {
      try {
        addresses = await this.resolver(hostname);
      } catch {
        throw new ScanFailure("dns_failure", `Could not resolve "${hostname}".`);
      }
      if (addresses.length === 0)
        throw new ScanFailure("dns_failure", `"${hostname}" has no addresses.`);
    }

    for (const address of addresses) {
      const c = classifyIp(address);
      if (!c.allowed) {
        if (loopbackAllowed && c.range === "loopback") continue;
        throw new ScanFailure(
          "blocked_destination",
          `"${hostname}" resolves to a non-public address (${c.range}). Internal, private and reserved destinations are blocked.`,
        );
      }
    }
    const address = addresses[0]!;
    return { hostname, port, address, family: address.includes(":") ? 6 : 4 };
  }
}
