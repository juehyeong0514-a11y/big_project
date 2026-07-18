import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { OperationsReadiness, OperationsReadinessCheck, OperationsReadinessStatus } from "@dcvp/shared";
import { PrismaService } from "./prisma.service.js";
import { hasUsableConfigValue } from "./config-values.js";
import { providerBaseUrl } from "./identity-provider-security.js";
import { isUsablePublicHttpsUrl } from "./public-url-config.js";
export { hasUsableConfigValue } from "./config-values.js";

@Injectable()
export class OperationsReadinessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getReadiness(): Promise<OperationsReadiness> {
    const checks = [
      await this.databaseCheck(),
      this.emailCheck(),
      this.kycCheck(),
      this.publicUrlCheck(),
      this.authCheck(),
      this.codeRunnerCheck(),
      this.proctorCheck(),
      this.proctorIceCheck()
    ];
    return {
      generatedAt: new Date().toISOString(),
      overallStatus: this.overallStatus(checks),
      checks
    };
  }

  private async databaseCheck(): Promise<OperationsReadinessCheck> {
    if (process.env.DISABLE_DATABASE === "1" || !hasUsableConfigValue(process.env.DATABASE_URL)) {
      return this.check("database", "데이터베이스", "ACTION_REQUIRED", "운영 DB 연결이 비활성화되어 있거나 DATABASE_URL이 placeholder입니다.", "실제 PostgreSQL DATABASE_URL을 설정하고 DISABLE_DATABASE를 끄세요.");
    }

    try {
      await this.prisma.user.count();
      return this.check("database", "데이터베이스", "READY", "PostgreSQL 연결과 기본 쿼리가 정상입니다.", "추가 조치 없음");
    } catch (error) {
      if (error instanceof Error) {
        return this.check("database", "데이터베이스", "ACTION_REQUIRED", "DATABASE_URL은 있으나 현재 DB 쿼리가 실패했습니다.", "PostgreSQL 실행 상태, 계정, 네트워크, 마이그레이션을 확인하세요.");
      }
      throw error;
    }
  }

  private emailCheck(): OperationsReadinessCheck {
    const provider = process.env.EMAIL_PROVIDER ?? "resend";
    const resendReady = provider === "resend" && this.hasUsableResendConfig();
    if (resendReady) {
      return this.check("email", "초대 메일", "READY", "Resend 발송 설정이 준비되어 있습니다. API 키 값은 응답에 노출하지 않습니다.", "도메인 인증 후 실제 응시자에게 테스트 발송하세요.");
    }
    if (provider !== "resend") {
      return this.check("email", "초대 메일", "WARNING", `현재 EMAIL_PROVIDER가 ${provider}입니다. 운영 기본 경로는 resend입니다.`, "EMAIL_PROVIDER=resend, RESEND_API_KEY, EMAIL_FROM_ADDRESS를 실제 값으로 설정하세요.");
    }
    return this.check("email", "초대 메일", "ACTION_REQUIRED", "Resend 발송에 필요한 실제 설정이 부족하거나 placeholder입니다.", "새 RESEND_API_KEY와 인증된 EMAIL_FROM_ADDRESS를 설정하세요.");
  }

  private kycCheck(): OperationsReadinessCheck {
    if (this.hasUsableKycConfig()) {
      return this.check("kyc", "본인확인 KYC", "READY", "KYC sandbox provider 호출 설정이 준비되어 있습니다. 원본 신분증/얼굴 이미지는 플랫폼 DB에 저장하지 않습니다.", "업체 sandbox 성공/실패 시나리오를 실행하세요.");
    }
    return this.check("kyc", "본인확인 KYC", "ACTION_REQUIRED", "KYC provider base URL 또는 API key가 없거나 placeholder입니다.", "KYC_SANDBOX_API_BASE_URL과 KYC_SANDBOX_API_KEY를 실제 업체 값으로 설정하세요.");
  }

  private publicUrlCheck(): OperationsReadinessCheck {
    const webUrl = process.env.WEB_PUBLIC_URL ?? process.env.PUBLIC_WEB_BASE_URL;
    const apiUrl = process.env.API_PUBLIC_URL ?? process.env.PUBLIC_API_BASE_URL;
    if (isUsablePublicHttpsUrl(webUrl) && isUsablePublicHttpsUrl(apiUrl)) {
      return this.check("public-url", "Public HTTPS URL", "READY", "모바일 QR 접속용 WEB_PUBLIC_URL/API_PUBLIC_URL이 실제 HTTPS 주소로 설정되어 있습니다.", "실제 휴대폰 LTE/외부망에서 QR 접속을 확인하세요.");
    }
    return this.check("public-url", "Public HTTPS URL", "WARNING", "운영용 public HTTPS URL 설정이 완전하지 않습니다. localhost/example 도메인은 운영 준비로 보지 않습니다.", "WEB_PUBLIC_URL과 API_PUBLIC_URL을 실제 https:// 도메인으로 설정하세요.");
  }

  private authCheck(): OperationsReadinessCheck {
    const production = process.env.NODE_ENV === "production";
    if (production && process.env.ALLOW_DEMO_AUTH === "1") {
      return this.check("auth", "관리자 인증", "ACTION_REQUIRED", "운영 환경에서 데모 로그인이 허용되어 있습니다.", "ALLOW_DEMO_AUTH를 제거하고 실제 관리자 계정을 사용하세요.");
    }
    const evidenceSecret = process.env.ENVIRONMENT_CHECK_SECRET ?? process.env.AUTH_SESSION_SECRET;
    if (production && (!hasUsableConfigValue(evidenceSecret) || Buffer.byteLength(evidenceSecret ?? "") < 32)) {
      return this.check("auth", "관리자 인증", "ACTION_REQUIRED", "환경 점검 증빙 서명 비밀값이 없거나 충분히 강하지 않습니다.", "32바이트 이상의 임의 ENVIRONMENT_CHECK_SECRET을 비밀 환경 변수로 설정하세요.");
    }
    return this.check("auth", "관리자 인증", "READY", production ? "운영 환경에서 데모 로그인 차단 정책이 적용됩니다." : "개발 환경에서는 DB 장애 시 데모 로그인 fallback을 사용할 수 있습니다.", "운영 배포 전 최초 관리자 계정 생성을 확인하세요.");
  }

  private proctorCheck(): OperationsReadinessCheck {
    const apiUrl = process.env.API_PUBLIC_URL ?? process.env.PUBLIC_API_BASE_URL;
    if (isUsablePublicHttpsUrl(apiUrl)) {
      return this.check("proctor", "실시간 감독", "READY", "WebSocket/WebRTC signaling을 위한 public API URL이 실제 HTTPS 기준으로 설정되어 있습니다.", "PC 캠과 모바일 보조캠을 동시에 열어 관리자 감독 화면을 확인하세요.");
    }
    return this.check("proctor", "실시간 감독", "WARNING", "로컬에서는 감독 signaling이 같은 장치 또는 LAN 조건에 의존할 수 있습니다.", "운영에서는 API_PUBLIC_URL을 실제 HTTPS 도메인으로 설정하세요.");
  }

  private codeRunnerCheck(): OperationsReadinessCheck {
    if (process.env.NODE_ENV === "production") {
      return this.check("code-runner", "코드 실행 격리", "ACTION_REQUIRED", "운영 API 내부의 로컬 Docker 실행은 호스트 보호를 위해 비활성화되어 있습니다.", "네트워크와 권한이 분리된 전용 러너 서비스를 구축하고 작업 큐·동시성·취소 정책을 검증한 뒤 연동하세요.");
    }
    return this.check("code-runner", "코드 실행 격리", "WARNING", "개발용 로컬 Docker 러너는 전역 2개 동시 실행, 최대 8개 대기열, 응시자별·IP별 요청 제한을 적용합니다.", "운영에서는 API 프로세스나 Docker 소켓을 직접 노출하지 말고 전용 러너를 사용하세요.");
  }

  private proctorIceCheck(): OperationsReadinessCheck {
    const rawIceServers = process.env.PROCTOR_ICE_SERVERS ?? process.env.VITE_PROCTOR_ICE_SERVERS;
    if (this.hasUsableTurnIceServer(rawIceServers)) {
      return this.check("proctor-ice", "TURN/ICE 서버", "READY", "모바일망/회사망 WebRTC 연결을 위한 TURN 서버 설정이 준비되어 있습니다. 세부 credential은 응답에 노출하지 않습니다.", "실제 휴대폰 LTE와 회사망에서 PC 캠/모바일 보조캠 동시 연결을 확인하세요.");
    }
    return this.check("proctor-ice", "TURN/ICE 서버", "WARNING", "STUN만 있거나 TURN 서버 credential이 없어 외부망 WebRTC 연결이 실패할 수 있습니다.", "PROCTOR_ICE_SERVERS 또는 VITE_PROCTOR_ICE_SERVERS에 turn:/turns: URL, username, credential을 설정하세요.");
  }

  private overallStatus(checks: readonly OperationsReadinessCheck[]): OperationsReadinessStatus {
    if (checks.some((check) => check.status === "ACTION_REQUIRED")) return "ACTION_REQUIRED";
    if (checks.some((check) => check.status === "WARNING")) return "WARNING";
    return "READY";
  }

  private hasUsableResendConfig() {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    return Boolean(apiKey?.startsWith("re_")) && hasUsableConfigValue(apiKey) && hasUsableConfigValue(process.env.EMAIL_FROM_ADDRESS);
  }

  private hasUsableKycConfig() {
    if (!hasUsableConfigValue(process.env.KYC_SANDBOX_API_BASE_URL) || !hasUsableConfigValue(process.env.KYC_SANDBOX_API_KEY)) {
      return false;
    }
    try {
      providerBaseUrl();
      return true;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return false;
      }
      throw error;
    }
  }

  private hasUsableTurnIceServer(value: string | undefined) {
    const trimmedValue = value?.trim();
    if (!trimmedValue || !hasUsableConfigValue(trimmedValue)) return false;
    try {
      const parsed: unknown = JSON.parse(trimmedValue);
      if (!Array.isArray(parsed)) return false;
      return parsed.some((entry) => this.isUsableTurnServer(entry));
    } catch (error) {
      if (error instanceof SyntaxError) {
        return false;
      }
      throw error;
    }
  }

  private isUsableTurnServer(value: unknown) {
    if (!this.isRecord(value)) return false;
    const urls = value["urls"];
    const username = value["username"];
    const credential = value["credential"];
    const hasTurnUrl = typeof urls === "string" ? this.isTurnUrl(urls) : Array.isArray(urls) && urls.some((url) => typeof url === "string" && this.isTurnUrl(url));
    return hasTurnUrl && hasUsableConfigValue(typeof username === "string" ? username : undefined) && hasUsableConfigValue(typeof credential === "string" ? credential : undefined);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private isTurnUrl(value: string) {
    const normalized = value.trim().toLowerCase();
    return normalized.startsWith("turn:") || normalized.startsWith("turns:");
  }

  private check(id: string, label: string, status: OperationsReadinessStatus, detail: string, action: string): OperationsReadinessCheck {
    return { id, label, status, detail, action };
  }
}
