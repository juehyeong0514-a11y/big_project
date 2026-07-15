import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { networkInterfaces } from "node:os";
import { PlatformStore } from "../services/platform-store.service.js";
import { AuthService } from "../services/auth.service.js";
import { normalizePublicHttpsUrl } from "../services/public-url-config.js";

@Controller()
export class DashboardController {
  constructor(
    @Inject(PlatformStore) private readonly store: PlatformStore,
    @Inject(AuthService) private readonly auth: AuthService
  ) {}

  @Get("/health")
  health() {
    return { ok: true, service: "dcvp-api" };
  }

  @Get("/api/mobile-access")
  mobileAccess() {
    const publicWebBaseUrl = process.env.WEB_PUBLIC_URL ?? process.env.PUBLIC_WEB_BASE_URL;
    const publicApiBaseUrl = process.env.API_PUBLIC_URL ?? process.env.PUBLIC_API_BASE_URL;
    const normalizedPublicWebBaseUrl = normalizePublicHttpsUrl(publicWebBaseUrl);

    if (normalizedPublicWebBaseUrl) {
      const normalizedPublicApiBaseUrl = normalizePublicHttpsUrl(publicApiBaseUrl) ?? normalizedPublicWebBaseUrl;
      return {
        host: new URL(normalizedPublicWebBaseUrl).host,
        webBaseUrl: normalizedPublicWebBaseUrl,
        apiBaseUrl: normalizedPublicApiBaseUrl
      };
    }

    const host = this.getLanIpv4Address() ?? "localhost";
    const webPort = process.env.WEB_PORT ?? "5173";
    const apiPort = process.env.PORT ?? "4000";
    return {
      host,
      webBaseUrl: `http://${host}:${webPort}`,
      apiBaseUrl: `http://${host}:${apiPort}`
    };
  }

  @Get("/api/dashboard")
  async dashboard(@Headers("authorization") authorization?: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.store.getDashboard(session);
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization?.startsWith("Bearer ")) {
      return undefined;
    }

    return authorization.slice("Bearer ".length);
  }

  private getLanIpv4Address() {
    const interfaces = networkInterfaces();
    const addresses = Object.entries(interfaces)
      .flatMap(([name, items]) => (items ?? []).map((item) => ({ name, item })))
      .filter(({ item }) => item.family === "IPv4" && !item.internal)
      .map(({ name, item }) => ({ name, address: item.address, score: this.scoreNetworkAddress(name, item.address) }))
      .sort((a, b) => b.score - a.score);

    return addresses[0]?.address;
  }

  private scoreNetworkAddress(name: string, address: string) {
    const normalizedName = name.toLowerCase();
    const isVirtual = /vmware|virtualbox|vethernet|wsl|hyper-v|bluetooth/.test(normalizedName);
    let score = isVirtual ? -100 : 0;

    if (/wi-?fi|wireless|wlan/.test(normalizedName)) score += 100;
    if (address.startsWith("192.168.0.")) score += 80;
    else if (address.startsWith("192.168.1.")) score += 70;
    else if (address.startsWith("192.168.")) score += 50;
    else if (address.startsWith("10.")) score += 40;
    else if (address.startsWith("172.")) score += 20;

    return score;
  }
}
