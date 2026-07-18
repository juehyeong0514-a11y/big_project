import { Building2, MailCheck, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import type { AuthSession } from "@dcvp/shared";

export function MemberHome({ session }: { readonly session: AuthSession }) {
  const affiliated = Boolean(session.user.organizationId);

  return (
    <div className="stack">
      <section className="panel hero-panel">
        <div>
          <span className="eyebrow">계정 홈</span>
          <h2>{affiliated ? session.organization.name : "소속 조직이 없습니다"}</h2>
          <p>{affiliated ? "조직 권한 신청과 받은 알림을 확인할 수 있습니다." : "새 조직을 만들거나 조직 코드로 참여를 신청하세요."}</p>
        </div>
        <ShieldCheck size={24} />
      </section>
      <section className="panel">
        <div className="section-title"><div><h2>사용 가능한 메뉴</h2><p>일반 계정에는 운영·시험 관리 정보가 표시되지 않습니다.</p></div></div>
        <div className="quick-grid">
          {!affiliated ? <Link className="quick-card" to="/organization-application"><Building2 size={20} /><strong>조직 신청</strong><span>조직 만들기 또는 기존 조직 참여</span></Link> : null}
          {!affiliated ? <Link className="quick-card" to="/organization-invitations"><MailCheck size={20} /><strong>조직 초대</strong><span>내 계정에 등록된 초대 확인</span></Link> : null}
          {affiliated ? <Link className="quick-card" to="/organization-manager-application"><ShieldCheck size={20} /><strong>조직 관리자 신청</strong><span>현재 조직에 권한 승격 요청</span></Link> : null}
        </div>
      </section>
    </div>
  );
}
