export type AuthTransportRequest = {
  readonly forwardedProto: string | undefined;
  readonly isProduction: boolean;
  readonly path: string;
  readonly socketEncrypted: boolean;
  readonly trustProxy: boolean;
};

export function shouldRejectInsecureRequest(request: AuthTransportRequest) {
  if (!request.isProduction || !isApiRoute(request.path) || request.socketEncrypted) {
    return false;
  }

  return !request.trustProxy || !hasForwardedHttps(request.forwardedProto);
}

function isApiRoute(path: string) {
  return path === "/api" || path.startsWith("/api/");
}

function hasForwardedHttps(forwardedProto: string | undefined) {
  return forwardedProto?.split(",", 1)[0]?.trim().toLowerCase() === "https";
}
