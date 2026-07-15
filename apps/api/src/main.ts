import "reflect-metadata";
import { config } from "dotenv";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module.js";

config({ path: "../../.env" });
config();

const port = Number(process.env.PORT ?? 4000);

function isAllowedWebOrigin(origin: string | undefined) {
  if (!origin) return true;

  const configuredOrigin = process.env.WEB_ORIGIN;
  if (configuredOrigin && origin === configuredOrigin) return true;
  if (process.env.NODE_ENV === "production") return false;

  try {
    const url = new URL(origin);
    return url.protocol === "http:" && url.port === (process.env.WEB_PORT ?? "5173") && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || isPrivateIpv4(url.hostname));
  } catch {
    return false;
  }
}

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;

  const [first, second] = octets;
  return first === 10 || first === 192 && second === 168 || first === 172 && second >= 16 && second <= 31;
}

type CorsOriginCallback = (error: Error | null, origin?: boolean | string | RegExp | (string | RegExp)[]) => void;
type CorsOrigin = (origin: string | undefined, callback: CorsOriginCallback) => void;

const corsOrigin: CorsOrigin = (origin, callback) => callback(null, isAllowedWebOrigin(origin));

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: corsOrigin,
    credentials: true
  });
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

void bootstrap();
