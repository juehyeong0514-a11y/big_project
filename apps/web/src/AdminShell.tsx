import { Link, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { BarChart3, Bot, Building2, ClipboardList, Plus, ServerCog, ShieldCheck, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { AuthSession } from "@dcvp/shared";
import { api } from "./api";
import { AiEvaluation } from "./AiEvaluation";
import { Dashboard } from "./Dashboard";
import { ExamCreate, ExamDetail, ExamEdit, ExamList } from "./ExamManagement";
import { LiveProctorDashboard } from "./LiveProctorDashboard";
import { OperationsReadiness } from "./OperationsReadiness";
import { AdminUsers } from "./AdminUsers";
import { OrganizationAccess } from "./OrganizationAccess";
import { OrganizationApplication } from "./OrganizationApplication";
import { OrganizationInvitationInbox } from "./OrganizationInvitationInbox";
import { MemberHome } from "./MemberHome";
import { privacyContact } from "./privacyContact";

const roleLabels: Record<AuthSession["user"]["role"], string> = {
  ADMIN: "운영자",
  ORGANIZATION: "조직 관리자",
  PROCTOR: "감독관",
  CANDIDATE: "응시자"
};

export function AdminShell({ session, onLogout, onSessionUpdated }: { readonly session: AuthSession; readonly onLogout: () => void; readonly onSessionUpdated: (session: AuthSession) => void }) {
  const organizationName = session.organization?.name ?? "소속 없음";
  const accountSummary = [organizationName, roleLabels[session.user.role], session.user.email].filter(Boolean).join(" / ");
  const canManageOrganization = session.user.role === "ADMIN" || session.user.role === "ORGANIZATION";
  const canViewExams = session.user.role !== "CANDIDATE";
  const canViewAiEvaluation = canManageOrganization;
  const canViewOperations = session.user.role === "ADMIN";
  const canRequestOrganization = session.user.role !== "ADMIN" && !session.user.organizationId;
  const canViewInvitationInbox = session.user.role !== "ADMIN" && !session.user.organizationId;
  const canRequestOrganizationManager = session.user.role !== "ADMIN" && session.user.role !== "ORGANIZATION" && Boolean(session.user.organizationId);
  const pendingApprovalCountQuery = useQuery({
    queryKey: ["pending-approval-count"],
    queryFn: api.pendingApprovalCount,
    enabled: canManageOrganization,
    refetchInterval: 30_000
  });
  const pendingApprovalCount = pendingApprovalCountQuery.data?.count ?? 0;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <ShieldCheck size={24} />
          <div>
            <strong>DCVP</strong>
            <span>역량 검증 플랫폼</span>
          </div>
        </div>
        <nav>
          <NavLink to="/" end>
            <BarChart3 size={18} />
            대시보드
          </NavLink>
          {canViewExams ? <NavLink to="/exams"><ClipboardList size={18} />시험 관리</NavLink> : null}
          {canViewOperations ? (
            <NavLink to="/operations">
              <ServerCog size={18} />
              운영 준비도
            </NavLink>
          ) : null}
          {canViewAiEvaluation ? <NavLink to="/ai-evaluation"><Bot size={18} />AI 평가</NavLink> : null}
          {canManageOrganization ? (
            <NavLink to="/admin-users">
              <Users size={18} />
              <span>계정 관리</span>
              {pendingApprovalCount > 0 ? <span className="sidebar-nav-badge" aria-label={`승인 대기 ${pendingApprovalCount}건`}>{pendingApprovalCount > 99 ? "99+" : pendingApprovalCount}</span> : null}
            </NavLink>
          ) : null}
          {canRequestOrganization ? (
            <NavLink to="/organization-application">
              <Building2 size={18} />
              조직 신청
            </NavLink>
          ) : null}
          {canViewInvitationInbox ? (
            <NavLink to="/organization-invitations">
              <Users size={18} />
              조직 초대
            </NavLink>
          ) : null}
          {canRequestOrganizationManager ? (
            <NavLink to="/organization-manager-application">
              <Users size={18} />
              조직 관리자 신청
            </NavLink>
          ) : null}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">관리자 콘솔</span>
            <h1>개발자 역량 검증 플랫폼</h1>
          </div>
          <div className="account-box">
            <div>
              <strong>{session.user.name}</strong>
              <span>
                {accountSummary}
              </span>
            </div>
            <button className="ghost-action" type="button" onClick={onLogout}>
              로그아웃
            </button>
            {canManageOrganization ? (
              <Link className="primary-action" to="/exams/new">
                <Plus size={18} />새 시험
              </Link>
            ) : null}
          </div>
        </header>
        <Routes>
          <Route path="/" element={canViewExams ? <Dashboard session={session} /> : <MemberHome session={session} />} />
          <Route path="/exams" element={canViewExams ? <ExamList session={session} /> : <Navigate to="/" replace />} />
          <Route path="/exams/new" element={canManageOrganization ? <ExamCreate /> : <Navigate to="/exams" replace />} />
          <Route path="/exams/:examId/edit" element={canManageOrganization ? <ExamEdit /> : <Navigate to="/exams" replace />} />
          <Route path="/exams/:examId" element={canManageOrganization ? <ExamDetail session={session} /> : <Navigate to="/exams" replace />} />
          <Route path="/exams/:examId/proctor" element={canViewExams ? <LiveProctorDashboard /> : <Navigate to="/" replace />} />
          <Route path="/operations" element={canViewOperations ? <OperationsReadiness /> : <Navigate to="/" replace />} />
          <Route path="/ai-evaluation" element={canViewAiEvaluation ? <AiEvaluation /> : <Navigate to="/" replace />} />
          <Route path="/admin-users" element={canManageOrganization ? <AdminUsers session={session} /> : <Navigate to="/exams" replace />} />
          <Route path="/organization-application" element={canRequestOrganization ? <OrganizationApplication session={session} onUpdated={onSessionUpdated} /> : <Navigate to="/" replace />} />
          <Route path="/organization-invitations" element={canViewInvitationInbox ? <OrganizationInvitationInbox session={session} onUpdated={onSessionUpdated} /> : <Navigate to="/" replace />} />
          <Route path="/organization-manager-application" element={canRequestOrganizationManager ? <OrganizationAccess session={session} onUpdated={onSessionUpdated} requestedRole="ORGANIZATION" /> : <Navigate to="/" replace />} />
        </Routes>
        <footer className="service-footer"><Link to="/privacy">개인정보 처리방침</Link><span>개인정보 보호 및 보안 문의: {privacyContact.email}</span></footer>
      </main>
    </div>
  );
}
