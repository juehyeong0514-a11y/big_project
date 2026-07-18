# 개발자 역량 검증 플랫폼 (DCVP)

코딩 시험, 응시자 환경 점검·본인확인, PC/모바일 감독, 채점, AI 역량 리포트, 조직·권한 관리를 한 곳에서 처리하는 멀티 테넌트형 역량 검증 플랫폼입니다.

이 문서는 **현재 실제 구현된 범위**와 **운영 전에 반드시 해야 할 일**, 그리고 다음 개발자가 바로 이어서 작업할 수 있도록 필요한 구조와 의사결정을 정리한 인수인계 문서입니다.

## 1. 빠른 시작

### 요구 사항

- Node.js 20 이상
- pnpm 11
- Docker Desktop 또는 Docker Engine
- PostgreSQL 16 (로컬 Docker Compose로 실행 가능)
- JavaScript/Python 코드 실행까지 확인하려면 Docker 데몬 실행 상태 필요

### 로컬 실행

```bash
pnpm install
docker compose up -d
copy .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Windows PowerShell의 실행 정책 때문에 `pnpm`이 막히면 같은 명령을 `pnpm.cmd`로 실행합니다.

```powershell
pnpm.cmd dev
```

개별 실행도 가능합니다.

```bash
pnpm dev:api
pnpm dev:web
```

| 항목 | 주소 |
| --- | --- |
| 웹 콘솔 | `http://localhost:5173` |
| API | `http://localhost:4000` |
| API 상태 확인 | `http://localhost:4000/health` |
| 샘플 응시자 시험 | `http://localhost:5173/candidate/invite_demo_001/exam` |

개발용 운영자 계정은 다음과 같습니다. 운영 환경에서는 사용할 수 없도록 구성해야 합니다.

```text
이메일: admin@acme.test
비밀번호: @A1234567890 (개발 전용, 운영에서는 INITIAL_ADMIN_PASSWORD로 별도 설정)
```

## 2. 프로젝트 구조

```text
apps/
  api/                  NestJS API, Prisma 스키마·마이그레이션, WebSocket 감독 신호
  web/                  React + TypeScript + Vite 관리자/응시자 화면
packages/
  shared/               프론트엔드와 API가 공유하는 타입·DTO·도메인 모델
docs/
  production-deployment.md  운영 배포 체크리스트
  identity-provider-spec.md KYC 제공자 연동 계약
deploy/
  Caddyfile             운영 HTTPS 프록시 설정
docker-compose.yml      로컬 PostgreSQL·Redis
docker-compose.prod.yml 운영용 PostgreSQL·API·웹·Caddy
```

### 주요 기술

- 웹: React 18, TypeScript, Vite, React Router, TanStack Query, Monaco Editor, Socket.IO Client
- API: NestJS 11, TypeScript, Prisma, PostgreSQL, Socket.IO
- 실행 채점: Docker 격리 컨테이너 (`node:20-alpine`, `python:3.12-alpine`)
- 실시간 감독: WebRTC 미디어, Socket.IO signaling
- 외부 연동: Resend 초대 메일, KYC 제공자, 외부 AI 평가 API

## 3. 현재 구현된 기능

### 3.1 역할과 조직 권한

| 역할 | 범위 | 현재 가능한 주요 작업 |
| --- | --- | --- |
| 운영자 (`ADMIN`) | 플랫폼 전체 | 전체 조직·계정 조회, 조직 생성 신청 승인/거절, 모든 조직의 가입·권한 신청 검토, 운영 준비도 확인, 운영자 외 계정 삭제 |
| 조직 관리자 (`ORGANIZATION`) | 자기 조직 | 시험·문제·응시자 관리, 자기 조직 가입/권한 신청 검토, 조직 코드 확인, 가입된 계정에 관리자·감독관 초대 등록 |
| 감독관 (`PROCTOR`) | 자기 조직 | 배정된 시험 확인, 실시간 감독 화면 확인 |
| 일반 계정/응시자 (`CANDIDATE`) | 소속 전 또는 자기 조직 | 일반 회원가입, 조직 참여 신청, 받은 조직 초대 수락, 감독관·조직 관리자 권한 신청 |

권한은 프론트엔드 메뉴 숨김만으로 처리하지 않고 API에서도 검증합니다. 계정 삭제 뒤에는 해당 사용자의 서버 세션을 회수합니다.

### 3.2 회원가입·조직 참여 흐름

로그인은 이메일과 비밀번호를 사용하며, 별도의 로그인 아이디는 없습니다. 조직 초대 역시 **가입된 계정의 이메일**을 식별자로 사용합니다.

```text
일반 회원가입
  └─ 소속 없음 상태의 CANDIDATE 계정 생성

소속 없음 사용자
  ├─ [조직 신청] → 새 조직 만들기 → 운영자 승인 → 조직 생성 + 신청자가 조직 관리자
  └─ [조직 신청] → 기존 조직 들어가기 → 조직 코드 + 사유 → 조직 관리자 승인 → 일반 소속 사용자

소속 사용자
  └─ [조직 관리자 신청] → 조직 관리자 승인 → ORGANIZATION 권한

조직 관리자
  ├─ 조직 코드 공유
  ├─ 가입된 계정 이메일 + 역할(조직 관리자/감독관)로 내부 초대 알림 등록
  └─ 가입·권한 요청 승인 또는 거절
```

중요한 현재 정책은 다음과 같습니다.

- 조직 코드 형식은 `ORG-XXXXXXXX`이며, 조직 관리 화면에서 복사할 수 있습니다.
- 조직 가입 신청은 조직 코드와 사유가 필요합니다.
- 조직 관리자 초대는 메일을 보내지 않습니다. 가입된 계정의 내부 초대함에 알림을 등록하고, 대상 사용자가 로그인 후 수락합니다.
- 초대를 수락한 사용자는 해당 조직에 소속되며, 이미 다른 조직에 소속된 사용자는 수락할 수 없습니다.
- 운영자는 본인 계정과 마지막 운영자 계정을 삭제할 수 없습니다.

### 3.3 시험·문제·응시자 관리

- 조직별 시험 생성, 조회, 삭제
- 시험 일정, 제한 시간, 지원 언어, 화면 공유·본인확인·모바일 보조캠·감독 사용 여부 설정
- 코딩, 객관식, 단답형, 서술형 문제 관리
- 공개/비공개 테스트 케이스 관리
- 응시자 추가 및 시험 초대 URL 발급
- 응시자 초대 메일 발송 이력과 제공자 메시지 ID 저장
- 목록에서 `상세 보기`, `실시간 감독`을 명확한 버튼으로 제공

### 3.4 응시자 시험 흐름

```text
초대 링크 접속
  → 입장 확인
  → 환경 점검
  → 본인확인(시험 설정 시)
  → 모바일 보조캠 연결(시험 설정 시)
  → 시험 응시
  → 실행/제출
  → 결과·감독·AI 리포트 확인
```

- 환경 점검 결과를 저장하고, 필수 항목을 통과해야 다음 단계로 진행합니다.
- 본인확인은 모바일 QR/링크를 통해 신분증·얼굴 촬영 흐름을 제공합니다.
- 플랫폼 DB에는 원본 신분증·얼굴 이미지를 저장하지 않고 KYC 제공자의 결정·점수·검사 결과·참조 ID만 저장합니다.
- 시험 화면은 Monaco Editor를 사용하며, 로드 실패 시 텍스트 편집기로 대체합니다.
- 코드 임시 저장, 공개 테스트 실행, 전체 테스트 제출, 채점 결과 저장을 제공합니다.

### 3.5 코드 실행과 채점

현재 Docker 채점기는 JavaScript와 Python만 지원합니다.

| 언어 | 컨테이너 이미지 | 함수 규약 |
| --- | --- | --- |
| JavaScript | `node:20-alpine` | `function solution(input) { ... }` |
| Python | `python:3.12-alpine` | `def solution(input): ...` |

실행 컨테이너는 네트워크를 차단하고, 메모리 256MB, CPU 0.5, PID 64, 실행 제한 8초를 적용합니다. 공개 테스트는 `실행`, 전체 테스트는 `제출`에 사용합니다. 각 테스트의 입력·기대값·실제값·성공 여부·오류·실행 시간을 보관합니다.

### 3.6 본인확인·모바일·실시간 감독

- PC 카메라와 모바일 보조캠의 연결 상태를 저장합니다.
- 모바일 보조캠은 QR 링크 또는 직접 링크로 접속합니다.
- 탭 숨김/복귀, 창 포커스 변경, 복사·붙여넣기, 전체 화면 변경, 카메라 권한·연결, 모바일 페이지 이탈·네트워크 상태·하트비트 누락을 감독 이벤트로 기록합니다.
- 감독관은 실시간 감독 화면에서 응시자별 상태를 보고 경고, 일시정지, 재개, 종료, 메모 동작을 남길 수 있습니다.
- 동영상 원본 저장 기능은 구현 범위가 아닙니다. 연결 상태·감독 이벤트·실시간 스트림 중심입니다.

### 3.7 AI 평가와 리포트

- 제출, 채점, 실행 횟수, 시간, 감독 위험 신호를 기반으로 역량 리포트를 생성하고 이력을 저장합니다.
- 외부 AI API가 설정되지 않으면 현재는 신호 기반 규칙 계산으로 점수·강점·개선점·추천을 생성합니다.
- 외부 AI API를 연결하면 서버가 설정된 외부 서비스의 `POST /api/ai/report/generate` 계약으로 위임합니다. 이 경로는 DCVP의 공개 API가 아닙니다.
- 시험 단위로 후보자 AI 리포트를 생성하고, 시험 보고서에서 저장된 리포트와 채점 결과를 확인할 수 있습니다.

### 3.8 운영 준비도

운영자 메뉴의 `운영 준비도`는 다음을 점검하며 비밀값은 응답에 노출하지 않습니다.

- PostgreSQL 연결
- Resend 초대 메일 설정
- KYC 제공자 설정
- Public HTTPS 웹/API URL
- 운영자 인증 정책
- 실시간 감독 signaling URL
- TURN/ICE 서버 설정

## 4. API와 화면 진입점

### 관리자 화면 경로

| 경로 | 설명 |
| --- | --- |
| `/` | 대시보드 |
| `/exams` | 시험 목록 |
| `/exams/new` | 시험 생성 |
| `/exams/:examId` | 시험 상세·문제·응시자·보고서 |
| `/exams/:examId/proctor` | 실시간 감독 |
| `/ai-evaluation` | AI 평가 |
| `/admin-users` | 계정·조직 요청·권한 요청·조직 초대 관리 |
| `/organization-application` | 소속 없음 사용자의 조직 신청 |
| `/organization-invitations` | 받은 조직 초대함 |
| `/organization-manager-application` | 조직 관리자 권한 신청 |
| `/operations` | 운영 준비도, 운영자 전용 |

### 응시자 화면 경로

| 경로 | 설명 |
| --- | --- |
| `/candidate/:inviteToken` | 초대 링크 시작 화면 |
| `/candidate/:inviteToken/check` | 환경 점검 |
| `/candidate/:inviteToken/identity` | PC 본인확인 안내·모바일 QR |
| `/candidate/:inviteToken/mobile-identity` | 휴대폰 본인확인 |
| `/candidate/:inviteToken/mobile-proctor` | 휴대폰 보조캠 |
| `/candidate/:inviteToken/exam` | 시험 작업 공간 |

### 주요 API 그룹

- 인증: `/api/auth/login`, `/api/auth/register`, `/api/auth/me`, `/api/auth/logout`, `/api/auth/setup`
- 조직·계정: `/api/admin/users/*`
- 시험·응시자·채점: `/api/exams/*`
- AI 평가: `/api/ai/*`
- 운영 점검: `/api/operations/readiness`
- 모바일 접속 정보: `/api/mobile-access`
- 실시간 signaling: Socket.IO `/proctor`

세부 요청/응답 타입은 `packages/shared/src/index.ts`, 컨트롤러는 `apps/api/src/modules/`를 기준으로 확인합니다.

## 5. 환경 변수

전체 예시는 [.env.example](.env.example)에 있습니다. 실제 비밀값은 `.env` 또는 배포 환경 변수에만 두고 저장소에 커밋하지 않습니다.

### 로컬 개발에서 중요한 값

| 변수 | 용도 | 로컬 기본값 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 연결 | `postgresql://dcvp:dcvp@localhost:5432/dcvp` |
| `DISABLE_DATABASE` | DB 사용 여부 | `0` |
| `ALLOW_DEMO_AUTH` | 데모 운영자 로그인 허용 | `1` |
| `PORT` | API 포트 | `4000` |
| `WEB_PORT` | Vite 웹 포트 | `5173` |
| `WEB_ORIGIN` | API CORS 기준 웹 Origin | `http://localhost:5173` |
| `VITE_API_BASE_URL` | 웹 빌드 시 API 주소 | `http://localhost:4000` |
| `VITE_PROCTOR_ICE_SERVERS` | 브라우저 WebRTC ICE 서버 JSON | STUN 예시 |

### 외부 서비스·운영에 필요한 값

| 변수 | 용도 |
| --- | --- |
| `WEB_PUBLIC_URL` | 공개 HTTPS 웹 주소, 모바일 QR 링크에 사용 |
| `API_PUBLIC_URL` | 공개 HTTPS API 주소, 모바일 API·signaling에 사용 |
| `PUBLIC_WEB_BASE_URL`, `PUBLIC_API_BASE_URL` | 이전 이름 호환용 공개 URL 변수 |
| `PROCTOR_ICE_SERVERS` | API 운영 점검용 STUN/TURN 설정 JSON |
| `RESEND_API_KEY` | Resend 메일 발송 키 |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | 초대 메일 발신자 |
| `KYC_SANDBOX_API_BASE_URL`, `KYC_SANDBOX_API_KEY` | KYC 제공자 연동 |
| `AI_API_BASE_URL`, `AI_API_KEY` | 외부 AI 평가 API 연동 |
| `INITIAL_ADMIN_*` | 운영 배포 시 최초 운영자 시드 계정 |
| `VITE_PRIVACY_OFFICER_NAME`, `VITE_PRIVACY_CONTACT_EMAIL` | 개인정보 처리방침에 표시할 실제 보호책임자와 공개 문의 채널 |
| `POSTGRES_PASSWORD` | 운영 PostgreSQL 비밀번호 |
| `TLS_EMAIL`, `WEB_DOMAIN`, `API_DOMAIN` | Caddy HTTPS 인증서·도메인 설정 |
| `AUTH_HTTPS_TRUST_PROXY` | 운영 Caddy가 사설 API 컨테이너의 TLS를 종료할 때만 `1`; 로컬 개발은 `0` |
| `ENVIRONMENT_CHECK_SECRET` | 환경 점검 증빙 HMAC 서명 키. 운영에서는 placeholder가 아닌 32바이트 이상의 임의 비밀값 필수 |

## 6. 모바일 접속과 HTTPS

개발 서버는 LAN 접속을 지원합니다. PC와 휴대폰이 같은 Wi-Fi에 있다면 PC의 Wi-Fi IPv4 주소로 접속합니다.

```text
예: http://192.168.0.114:5173
```

웹은 접속한 호스트명을 유지해 같은 PC의 API 포트(`:4000`)로 요청합니다. 개발 환경의 API CORS는 `localhost`, `127.0.0.1`, 사설 IPv4 대역의 웹 포트만 허용합니다.

단, **페이지 접속 가능 여부와 휴대폰 카메라 사용 가능 여부는 다릅니다.** 모바일 브라우저의 카메라/WebRTC는 신뢰 가능한 HTTPS 환경을 요구하므로, 실제 본인확인·보조캠 운영에는 도메인과 HTTPS가 필요합니다.

운영에서는 다음을 모두 갖춰야 합니다.

1. 웹과 API 도메인 DNS 연결
2. `WEB_PUBLIC_URL`, `API_PUBLIC_URL`, `WEB_ORIGIN`에 실제 `https://` 주소 설정
3. Caddy/Nginx/로드밸런서/Cloudflare Tunnel 등 TLS 종료 계층 구성
4. Socket.IO WebSocket 업그레이드 전달
5. TURN 또는 TURNS 서버와 실제 자격증명 설정
6. 휴대폰 LTE와 회사망에서 PC 카메라·모바일 보조캠을 각각 검증

자세한 운영 배포 절차는 [docs/production-deployment.md](docs/production-deployment.md)를 참고합니다.

## 7. 데이터와 보안 원칙

### 인증과 비밀번호

- 비밀번호 작성 규칙은 **12~256자, 영문 대문자·소문자·숫자·특수문자 중 3종 이상**입니다. 최초 운영자, 일반 회원가입, 기존 조직 관리자 신청, 비밀번호 변경에 같은 서버 규칙을 적용합니다.
- 비밀번호는 임의 16바이트 salt와 PBKDF2-SHA-256 310,000회로 단방향 해시해 저장합니다. 평문 비밀번호는 DB에 저장하지 않습니다. 생성·검증은 Node 작업 스레드에서 비동기로 수행하며, 프로세스별 동시 연산 4개·대기 16개·대기시간 5초로 제한해 공개 요청이 이벤트 루프나 작업 큐를 고갈시키지 않게 합니다.
- 이전 SHA-256 형식 계정은 정상 비밀번호로 로그인한 직후 PBKDF2 형식으로 자동 교체합니다.
- 이메일·비밀번호가 틀리면 어느 값이 틀렸는지 구분하지 않는 같은 오류를 반환합니다. 존재하지 않는 계정에도 더미 해시 검증을 수행합니다.
- 계정별 로그인 실패 횟수를 직렬화 트랜잭션으로 갱신하며 5회 실패 시 15분 동안 잠급니다. 잠금 중에도 동일한 인증 오류만 반환합니다.
- 로그인은 1분 창 기준 계정 식별자 10회, 클라이언트 20회로 추가 제한합니다. 낮은 프로세스 전체 고정 할당량은 한 공격자가 정상 사용자까지 차단할 수 있어 사용하지 않고, 실제 고비용 PBKDF2 연산은 별도의 동시 실행·대기열 상한으로 보호합니다. 식별자는 메모리에 해시해 보관하고 운영 프록시를 명시적으로 신뢰할 때만 전달 IP 헤더를 사용합니다.
- 공개 회원가입과 최초 운영자 생성은 같은 클라이언트 기준 분당 6회, 계정 식별자 기준 분당 3회로 제한해 공격자가 PBKDF2 대기열을 반복 점유하지 못하게 합니다.
- 비밀번호 유효기간은 90일입니다. 만료되면 일반 API와 WebSocket 감독 참여를 차단하고 비밀번호 변경 화면만 허용합니다.
- 비밀번호 변경, 계정 삭제, 역할·조직·이메일 변경 시 해당 계정의 기존 서버 세션을 회수합니다.
- 세션 토큰은 전체 UUID 난수로 만들고 서버 메모리에만 저장합니다. 절대 만료 8시간, 미사용 만료 30분을 적용하며 브라우저는 `localStorage`가 아닌 탭 단위 `sessionStorage`에 저장합니다.
- 세션별 만료 타이머가 수동 API 요청이 없어도 만료 즉시 철회 이벤트를 발생시키며, 로그아웃·만료 시 연결된 감독 WebSocket도 서버가 강제로 종료합니다.

### 전송·브라우저 보안

- 운영 모드에서는 모든 `/api/*` 요청이 HTTPS가 아니면 `403`으로 거부됩니다. Caddy가 TLS를 종료하는 구성에서만 `AUTH_HTTPS_TRUST_PROXY=1`을 사용합니다.
- Caddy는 HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`를 적용합니다. 웹 컨테이너의 Nginx에도 같은 CSP·브라우저 보호 헤더가 있습니다.
- API와 Socket.IO CORS는 운영 `WEB_ORIGIN` 한 개만 허용합니다. 개발 환경은 지정 웹 포트의 localhost·사설 LAN 주소만 허용합니다.
- 인증은 쿠키가 아니라 `Authorization: Bearer` 헤더를 사용하고 CORS의 `credentials`를 끕니다. 따라서 브라우저가 쿠키를 자동 첨부하는 전형적인 CSRF 경로는 없습니다. 향후 쿠키 인증을 도입하면 SameSite·CSRF 토큰 검증을 함께 구현해야 합니다.
- API 응답은 기본적으로 `Cache-Control: no-store`이며 프레임 삽입과 MIME 추측을 차단합니다.

### 개인정보 동의와 표시 제한

- 회원가입과 최초 운영자 생성은 현재 개인정보 처리방침 버전의 필수 동의가 없으면 서버에서 거부합니다. DB에는 동의 버전과 동의 시각을 함께 저장합니다.
- 로그인 화면과 모든 로그인 후 화면 하단에서 `/privacy` 개인정보 처리방침에 접근할 수 있습니다.
- 운영자·조직 관리자 화면은 이름과 이메일을 기본 마스킹합니다. 계정 수정 버튼을 명시적으로 누른 경우에만 수정 입력칸에서 원문을 확인합니다.
- 공통 마스킹 도구는 이름 가운데 글자, 이메일 ID 앞 2자 이후, 휴대전화 가운데 번호, 주민등록번호 뒤 7자리, 카드번호 7~12번째, 주소 숫자, IPv4 17~24비트·IPv6 마지막 16비트를 가릴 수 있습니다.
- 응시자 본인 화면에는 본인의 이름을 표시할 수 있지만 다른 응시자의 개인정보를 보는 관리·감독·리포트 화면에는 마스킹을 적용합니다.
- 일반 계정은 운영 대시보드, 시험 상세·비공개 테스트케이스, AI 리포트, 운영 준비도 API에 접근할 수 없습니다. 감독관은 시험 목록과 실시간 감독만 볼 수 있고 시험 편집 상세·AI 리포트는 볼 수 없습니다. 이 제한은 화면과 API 서비스 양쪽에서 검사합니다.

### KYC·파일·외부 URL

- 플랫폼에는 사용자가 임의 파일을 올리는 일반 파일 업로드 API가 없습니다. 따라서 확장자·개수 제한이 필요한 업로드 표면도 현재는 없습니다.
- 신분증·얼굴 원본은 플랫폼 API나 DB에 저장하지 않습니다. 모바일 웹은 KYC 제공자 세션과 짧은 참조값을 사용하고, 플랫폼은 제공자의 최종 판정·점수·참조 ID만 저장합니다.
- 모바일 KYC를 시작하기 전에 신분증 정보·얼굴·라이브니스 신호의 목적과 외부 KYC 업체 전송을 고지하고 필수 동의를 받습니다. 서버는 현재 처리방침 버전과 동의 시각을 후보자 및 인증 결과에 기록하며 누락되거나 오래된 동의는 거부합니다.
- KYC 참조값은 최대 256자로 제한하며 `data:` URL, JSON 데이터, 과도하게 긴 값은 거부합니다. 단순 파일명이나 촬영 완료 불리언만으로 본인확인을 통과시키지 않습니다.
- KYC는 문서 진위 85점 이상, 얼굴 일치 80점 이상, 라이브니스 80점 이상, OCR 이름 일치, 제공자 `VERIFIED`를 모두 충족해야 통과합니다.
- KYC·AI·메일·Webhook의 외부 요청은 URL 구문, HTTPS, 사용자 정보 포함 여부, 직접 IP, DNS가 해석한 사설·예약 주소를 검사합니다. 리다이렉트를 차단하고 10~15초 제한시간과 64KiB 응답 한도를 적용합니다.
- API 키와 비밀값은 `.env` 또는 배포 비밀 저장소에만 둡니다. `.env`는 Git에서 제외되며 `.env.example`에는 placeholder만 둡니다. 공급자 오류 본문과 DB 예외의 비밀정보는 로그·브라우저 응답에 그대로 노출하지 않습니다.

### 코드 실행과 데이터 저장

- 응시 코드는 `execFile` 인자 배열로 Docker를 호출하므로 셸 문자열 결합을 사용하지 않습니다.
- 개발용 러너는 API 프로세스 전체 동시 실행 2개, 대기열 8개, 대기 5초, 응시자별 분당 6회와 IP별 분당 제한을 적용합니다. 각 컨테이너는 최대 8초, 한 채점 요청 전체는 최대 30초 후 종료되어 여러 테스트케이스가 실행 슬롯을 장시간 점유하지 못합니다.
- 운영 API 내부에서 로컬 Docker 러너는 비활성화됩니다. 운영 채점을 사용하려면 API·DB·Docker 호스트와 네트워크/권한이 분리된 전용 러너 서비스, 인증된 작업 큐, 전역 자원 한도와 취소 처리를 먼저 구축해야 합니다.
- 공개 초대 정보에는 시험 문제가 포함되지 않습니다. 문제와 선택지는 서버가 일정·환경·본인확인·보조캠 조건을 검증한 시험 작업공간에서만 반환합니다.
- 실행 컨테이너는 네트워크 없음, 읽기 전용 루트, 모든 capability 제거, `no-new-privileges`, 비특권 사용자, PID·CPU·메모리·시간 제한, 읽기 전용 작업 공간, 제한된 `tmpfs`를 적용합니다.
- 코드 크기는 100,000자, 테스트케이스는 50개, 프로세스 출력 버퍼는 1MiB로 제한합니다.
- 원본 KYC 촬영물과 생체 이미지는 저장하지 않지만 PostgreSQL의 계정·시험·KYC 판정 메타데이터가 저장되는 운영 디스크와 백업은 반드시 암호화된 관리형 DB 또는 암호화 볼륨에 배치해야 합니다. 이 항목은 애플리케이션 코드가 아니라 배포 인프라 통제입니다.
- 운영 준비도 API는 API 키, 메일 키, KYC 키, TURN 자격증명을 반환하지 않으며 운영자 역할만 호출할 수 있습니다.
- 운영 환경에서는 `NODE_ENV=production`, `DISABLE_DATABASE=0`, `ALLOW_DEMO_AUTH=0`, 32바이트 이상 `ENVIRONMENT_CHECK_SECRET`이 필수입니다.

KYC 요청/응답 계약과 점수 통과 기준은 [docs/identity-provider-spec.md](docs/identity-provider-spec.md)에 있습니다.

## 8. 검증 명령

```bash
# 타입 검사
pnpm typecheck

# 전체 빌드
pnpm build

# API 회귀 검사 예시
node apps/api/src/modules/mobile-access.regression.mjs
node apps/api/src/services/organization-requests.regression.mjs
node apps/api/src/services/organization-invitations.regression.mjs
node apps/api/src/services/admin-users.regression.mjs
node apps/api/src/services/identity-verification.regression.mjs
node apps/api/src/services/operations-readiness.regression.mjs
node apps/api/src/services/auth-security-lifecycle.regression.mjs
node apps/api/src/services/authorization-boundaries.regression.mjs
node apps/api/src/services/security-hardening.regression.mjs
node --experimental-strip-types apps/web/src/privacy-masking.regression.mjs
```

기능 변경 후에는 타입 검사만으로 끝내지 말고 다음 사용 흐름을 브라우저에서 직접 확인합니다.

- 운영자: 로그인 → 조직 생성 신청 승인 → 조직/계정 관리 확인
- 일반 사용자: 회원가입 → 조직 신청 또는 받은 초대 수락
- 조직 관리자: 조직 코드 복사 → 가입 신청 승인 또는 조직 관리자/감독관 내부 초대 등록
- 응시자: 초대 링크 → 환경 점검 → 본인확인 → 실행·제출
- 감독관: 실시간 감독 → 경고/일시정지/재개/종료/메모
- 모바일: 동일 Wi-Fi와 LTE 각각에서 QR 접속, 카메라·보조캠·signaling 확인

## 9. 운영 배포 절차

1. `.env.example`를 기준으로 운영 환경 변수 파일을 작성합니다.
2. 실제 DNS, HTTPS, Resend 발신 도메인, KYC 제공자, TURN 서버를 준비합니다.
3. 운영자 시드 계정을 `INITIAL_ADMIN_*`으로 지정합니다.
   `db:seed`는 기존 운영자 비밀번호를 덮어쓰지 않으며 운영 모드에서는 샘플 시험·예측 가능한 데모 초대 링크를 생성하지 않습니다.
4. 배포합니다.

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api pnpm --filter @dcvp/api prisma:migrate
docker compose -f docker-compose.prod.yml exec api pnpm --filter @dcvp/api db:seed
```

5. 다음을 확인합니다.

```bash
curl -I https://<웹-도메인>
curl https://<API-도메인>/health
curl https://<API-도메인>/api/mobile-access
```

6. 운영자 화면의 `운영 준비도`가 모두 준비 완료인지 확인합니다.
7. 실제 메일 수신, KYC 성공/실패, PC·모바일 감독, LTE·회사망 TURN 연결을 스모크 테스트합니다.

## 10. 다음 개발 우선순위

아래 항목은 현재 코드의 한계 또는 운영에 필요한 후속 작업입니다. 기능 우선순위를 조정하더라도 운영 전 필수 항목은 미루지 않는 것을 권장합니다.

### 운영 전 필수

1. **공개 HTTPS 배포 완성**: 도메인, TLS, `WEB_PUBLIC_URL`, `API_PUBLIC_URL`, CORS, WebSocket 프록시를 실제 값으로 구성합니다.
2. **TURN 서버 운영 검증**: STUN만으로는 LTE·사내망에서 안정적인 WebRTC 연결을 보장하지 못합니다.
3. **실제 KYC 제공자 연동**: 현재 계약은 sandbox 기준입니다. 제공자 SDK/호스팅 페이지, 콜백 검증, 실패 재시도·고객지원 절차를 확정해야 합니다.
4. **실제 메일 발송 검증**: Resend 키·검증된 발신 도메인으로 후보자 초대 메일을 실수신 확인합니다.
5. **외부 AI 평가 정책 확정**: 모델, 프롬프트, 개인정보 처리, 비용 한도, 오류 시 동작을 정하고 `AI_API_BASE_URL` 연동을 검증합니다.
6. **운영 데이터베이스 백업·복구·모니터링**: 백업 주기, 복구 훈련, 로그/오류/성능 모니터링을 배포 환경에 추가합니다.

### 보안·확장성

1. **세션 영속화**: 현재 세션은 API 메모리 `Map`에만 있어 재시작 시 로그아웃되며 다중 API 인스턴스에서 공유되지 않습니다. Redis 기반 세션 또는 짧은 만료 JWT + 재발급 구조로 교체합니다.
2. **인증 강화**: 현재 구현된 로그인 실패 잠금·비밀번호 만료에 더해 비밀번호 재설정, 이메일 검증, MFA, 보안 감사 로그를 추가합니다.
3. **권한 감사 고도화**: 권한 변경·승인·거절·삭제·감독 조치를 감사 로그로 남기고 운영자 검색/내보내기를 제공합니다.
4. **조직 초대 관리 완성**: 현재 조직 초대는 생성·조회·수락 중심입니다. 취소, 만료, 재발송 여부, 관리자 UI의 필터/검색을 추가합니다.
5. **채점 격리 강화**: 실행 큐, 동시 실행 제한, 이미지 사전 준비, 디스크/출력 제한, 작업자 분리, 관측 지표를 도입합니다.
6. **개인정보 보존 정책**: 시험·감독 이벤트·KYC 메타데이터·리포트의 보존 기간, 삭제 요청, 접근 기록 정책을 정의합니다.

### 제품 기능

1. **채점 언어 확대**: Java, C/C++, Go 등 지원 언어를 추가할 때 각 언어의 컨테이너 격리·컴파일 시간·템플릿·테스트 규약을 함께 설계합니다.
2. **문제 은행과 재사용**: 문제 태그, 난이도, 버전, 복제, 조직별 공유 정책, 가져오기/내보내기를 추가합니다.
3. **시험 운영 기능**: 예약 발송, 시험 상태 자동 전환, 시간 연장, 재응시, 부정행위 검토 워크플로, 운영 알림을 추가합니다.
4. **리포트 개선**: 리포트 비교, CSV/PDF 내보내기, 면접 질문 추천, 평가 근거 링크, AI 결과 검토·수정·승인 기능을 추가합니다.
5. **접근성·다국어**: 키보드 조작, 화면 낭독, 색상 대비, 시간 제한 안내, 한국어/영어 다국어 체계를 정비합니다.
6. **모바일 UX 고도화**: 좁은 화면의 표를 카드형 또는 전용 모바일 목록으로 개선하고, 모바일 카메라 오류·네트워크 복구 안내를 강화합니다.

## 11. 이어서 개발할 때의 기준

- 공유 타입은 먼저 `packages/shared/src/index.ts`에 정의한 뒤 API와 웹에서 사용합니다.
- DB 구조 변경은 `apps/api/prisma/schema.prisma`와 새 Prisma 마이그레이션을 함께 추가합니다.
- 조직/권한 기능은 화면 숨김과 별개로 API 서비스에서 현재 DB 기준 역할을 재검증합니다.
- 모바일·카메라·WebRTC 기능은 데스크톱만 확인하지 말고 동일 Wi-Fi, LTE, 사내망에서 각각 검증합니다.
- 외부 제공자 연동은 키를 로그·API 응답·브라우저 번들에 노출하지 않습니다.
- 새 기능은 관련 회귀 검사와 브라우저 수동 흐름을 함께 추가·검증합니다.

현재 구현에 대한 질문이나 다음 작업의 시작점은 위의 `다음 개발 우선순위`, `apps/api/src/modules/`, `apps/api/src/services/`, `apps/web/src/`, `packages/shared/src/index.ts`를 순서대로 확인하면 됩니다.
