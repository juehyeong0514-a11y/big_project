import "reflect-metadata";
import { config } from "dotenv";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module.js";
import { shouldRejectInsecureRequest } from "./services/auth-transport-security.js";
import { isAllowedWebOrigin } from "./services/web-origin-policy.js";

config({ path: "../../.env" });
config();

const port = Number(process.env.PORT ?? 4000);

type CorsOriginCallback = (error: Error | null, origin?: boolean | string | RegExp | (string | RegExp)[]) => void;
type CorsOrigin = (origin: string | undefined, callback: CorsOriginCallback) => void;
type AuthTransportMiddlewareRequest = {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly path: string;
  readonly socket: { readonly encrypted?: boolean };
};
type AuthTransportMiddlewareResponse = {
  status(statusCode: number): AuthTransportMiddlewareResponse;
  json(body: { readonly message: string }): void;
  setHeader(name: string, value: string): void;
};
type AuthTransportMiddlewareNext = () => void;

const corsOrigin: CorsOrigin = (origin, callback) => callback(null, isAllowedWebOrigin(origin));

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use((request: AuthTransportMiddlewareRequest, response: AuthTransportMiddlewareResponse, next: AuthTransportMiddlewareNext) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("cross-origin-resource-policy", "same-site");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("x-frame-options", "DENY");
    const forwardedProto = request.headers["x-forwarded-proto"];
    const firstForwardedProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    const rejectRequest = shouldRejectInsecureRequest({
      forwardedProto: firstForwardedProto,
      isProduction: process.env.NODE_ENV === "production",
      path: request.path,
      socketEncrypted: request.socket.encrypted === true,
      trustProxy: process.env.AUTH_HTTPS_TRUST_PROXY === "1"
    });

    if (rejectRequest) {
      response.status(403).json({ message: "인증 요청은 HTTPS로만 허용됩니다." });
      return;
    }

    next();
  });
  app.enableCors({
    origin: corsOrigin,
    credentials: false
  });
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

void bootstrap();
