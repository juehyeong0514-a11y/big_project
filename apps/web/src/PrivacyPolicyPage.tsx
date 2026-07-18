import { CURRENT_PRIVACY_POLICY_VERSION } from "@dcvp/shared";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { privacyContact } from "./privacyContact";
import "./LoginPage.css";

export function PrivacyPolicyPage() {
  return (
    <main className="privacy-policy-page">
      <article className="privacy-policy-panel">
        <header className="privacy-policy-header">
          <div className="brand">
            <ShieldCheck size={24} />
            <div><strong>DCVP</strong><span>개인정보 처리방침</span></div>
          </div>
          <Link className="ghost-action" to="/"><ArrowLeft size={16} />서비스로 돌아가기</Link>
        </header>

        <div className="privacy-policy-copy">
          <span className="eyebrow">시행 버전 {CURRENT_PRIVACY_POLICY_VERSION}</span>
          <h1>개인정보 처리방침</h1>
          <p>DCVP는 계정, 시험 운영, 본인확인 및 감독 기능 제공에 필요한 범위에서 개인정보를 처리합니다.</p>
        </div>

        <section><h2>1. 처리 목적</h2><ul><li>회원가입, 로그인, 계정 및 권한 관리</li><li>시험 생성·응시·채점·리포트 제공</li><li>신분증 진위·얼굴 일치·라이브니스 결과를 이용한 본인확인</li><li>PC·모바일 카메라 연결 상태와 감독 이벤트 기록</li><li>보안 사고 대응, 접근 통제 및 서비스 안정성 확보</li></ul></section>
        <section><h2>2. 처리 항목</h2><ul><li>필수 계정 정보: 이름, 이메일, 단방향 해시된 비밀번호, 소속·권한</li><li>시험 정보: 응시 기록, 제출 코드, 채점 결과, 감독 이벤트</li><li>본인확인 정보: KYC 업체 세션 식별자, 신분증 정보, 얼굴·라이브니스 신호, 진위·얼굴 일치 판정 및 점수, 동의 버전·시각</li><li>접속·보안 정보: 브라우저 환경, 카메라 연결·끊김, 화면 이탈 및 네트워크 상태</li></ul><p>신분증 정보와 얼굴·라이브니스 신호는 본인확인 목적으로 설정된 KYC 전문 업체에 전송됩니다. 플랫폼 데이터베이스에는 신분증 원본 이미지와 얼굴 원본 이미지를 저장하지 않으며, 촬영 원본은 연동 업체의 보안 정책과 계약에 따라 처리됩니다.</p></section>
        <section><h2>3. 보유 및 이용 기간</h2><ul><li>회원 계정과 가입 동의 기록: 계정&nbsp;삭제&nbsp;시까지</li><li>조직 가입·권한 신청 기록: 신청 처리 및 조직 운영 종료 시까지</li><li>시험·감독·본인확인 결과: 해당 시험 또는 조직이 삭제될 때까지</li><li>법령이나 분쟁 대응을 위해 별도 보존이 필요한 경우: 해당 근거에서 정한 기간</li></ul></section>
        <section><h2>4. 동의 거부 권리</h2><p>개인정보 수집·이용 동의를 거부할 수 있습니다. 다만 필수 항목에 동의하지 않으면 계정을 만들거나 시험 서비스를 이용할&nbsp;수&nbsp;없습니다.</p></section>
        <section><h2>5. 처리 위탁 및 국외 이전</h2><p>KYC, 이메일, AI 평가 공급자를 활성화하는 경우 공급자명, 처리 국가, 항목, 목적, 보유기간을 실제 계약 기준으로 운영자가 별도 고지해야 합니다. 설정하지 않은 공급자로 정보가 전송되지는 않습니다.</p></section>
        <section><h2>6. 안전성 확보 조치</h2><ul><li>TLS 통신, 비밀번호 PBKDF2 단방향 해시, 로그인 실패 잠금</li><li>역할·조직별 접근 통제와 개인정보 기본 마스킹</li><li>KYC 원본 미보관, 외부 호출 제한시간·리다이렉트 차단</li><li>응시 코드의 격리된 컨테이너 실행과 네트워크 차단</li></ul></section>
        <section><h2>7. 문의 및 권리 행사</h2><p>열람, 정정, 삭제, 처리정지 또는 동의 철회는 로그인 후 계정 관리자에게 요청할 수 있습니다.</p><dl className="privacy-contact-list"><div><dt>개인정보 보호책임자</dt><dd>{privacyContact.officerName}</dd></div><div><dt>문의 이메일</dt><dd>{privacyContact.email}</dd></div></dl></section>
      </article>
    </main>
  );
}
