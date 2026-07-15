import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, FileCode2, IdCard, Video, Wifi } from "lucide-react";
import type { EnvironmentCheckItemId } from "@dcvp/shared";
import { api } from "./api";

type CheckStatus = "idle" | "checking" | "passed" | "failed" | "warning";

interface EnvironmentCheckItem {
  id: EnvironmentCheckItemId;
  label: string;
  description: string;
  status: CheckStatus;
  required: boolean;
}

const initialEnvironmentItems = (): EnvironmentCheckItem[] => [
  { id: "browser", label: "브라우저", description: "보안 컨텍스트와 필수 API를 확인합니다.", status: "idle", required: true },
  { id: "network", label: "네트워크", description: "시험 서버 연결 상태를 확인합니다.", status: "idle", required: true },
  { id: "camera", label: "카메라", description: "카메라 권한을 요청합니다.", status: "idle", required: true },
  { id: "microphone", label: "마이크", description: "마이크 권한을 요청합니다.", status: "idle", required: true },
  { id: "screen", label: "화면 공유", description: "화면 공유 권한을 요청합니다.", status: "idle", required: true }
];

export function CandidateEnvironmentCheck() {
  const { inviteToken = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["candidate-invite", inviteToken], queryFn: () => api.candidateInvite(inviteToken), enabled: Boolean(inviteToken) });
  const { data: checkSession, isError: checkSessionError } = useQuery({
    queryKey: ["environment-check-session", inviteToken],
    queryFn: () => api.createEnvironmentCheckSession(inviteToken),
    enabled: Boolean(inviteToken)
  });
  const [items, setItems] = useState<EnvironmentCheckItem[]>(initialEnvironmentItems);
  const setStatus = (id: EnvironmentCheckItemId, status: CheckStatus) => setItems((current) => current.map((item) => item.id === id ? { ...item, status } : item));
  const runCheck = async (id: EnvironmentCheckItemId) => {
    setStatus(id, "checking");
    try {
      if (id === "camera") (await navigator.mediaDevices.getUserMedia({ video: true })).getTracks().forEach((track) => track.stop());
      if (id === "microphone") (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((track) => track.stop());
      if (id === "screen") (await navigator.mediaDevices.getDisplayMedia({ video: true })).getTracks().forEach((track) => track.stop());
      if (id === "network") await api.candidateInvite(inviteToken);
      setStatus(id, id === "browser" && !window.isSecureContext ? "warning" : "passed");
    } catch {
      setStatus(id, "failed");
    }
  };
  const ready = items.filter((item) => item.required).every((item) => item.status === "passed" || item.status === "warning");
  const sessionReady = Boolean(checkSession) && !checkSessionError;
  const mobileProctorConnected = data?.proctorDevices.some((device) => device.role === "MOBILE_AUX" && device.status === "CONNECTED") ?? false;
  const examOpenReady = !data?.exam.mobileCameraRequired || mobileProctorConnected;
  const mutation = useMutation({
    mutationFn: () => {
      if (!checkSession) {
        throw new Error("Environment check session is not ready.");
      }
      return api.saveEnvironmentCheck(inviteToken, {
        sessionId: checkSession.sessionId,
        evidenceToken: checkSession.evidenceToken,
        browserEvidence: {
          userAgent: navigator.userAgent,
          secureContext: window.isSecureContext,
          checkedAt: new Date().toISOString()
        },
        results: items.map((item) => ({ id: item.id, status: item.status === "passed" ? "PASSED" : item.status === "warning" ? "WARNING" : "FAILED", detail: item.description }))
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["candidate-invite", inviteToken] });
      navigate(data?.exam.identityVerificationEnabled ? `/candidate/${inviteToken}/identity` : `/candidate/${inviteToken}/exam`);
    }
  });
  if (isLoading) return <main className="candidate-page">환경 점검을 불러오는 중입니다.</main>;
  if (isError || !data) return <CandidateEnvironmentError />;
  return (
    <main className="candidate-page">
      <section className="candidate-panel environment-panel">
        <div className="candidate-copy"><span className="eyebrow">시험 전 점검</span><h1>환경 점검</h1><p>{data.candidate.name}님의 장비와 브라우저 상태를 확인합니다.</p></div>
        <div className="environment-grid">
          {items.map((item) => <article key={item.id} className={`environment-card environment-${item.status}`}><div className="environment-icon"><Wifi size={20} /></div><div><strong>{item.label}</strong><p>{item.description}</p><span>{item.status}</span></div><button className="secondary-action" type="button" onClick={() => void runCheck(item.id)}>점검</button></article>)}
        </div>
        <div className={ready ? "ready-banner ready-banner-ok" : "ready-banner"}>{ready ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}{ready ? "필수 점검이 완료되었습니다." : "시험 전에 필수 점검을 실행해주세요."}</div>
        {data.exam.mobileCameraRequired && !data.exam.identityVerificationEnabled ? <div className={mobileProctorConnected ? "ready-banner ready-banner-ok" : "ready-banner"}>{mobileProctorConnected ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}{mobileProctorConnected ? "모바일 보조캠이 연결되었습니다." : "시험 열기 전에 모바일 보조캠을 연결해야 합니다."}</div> : null}
        {data.exam.mobileCameraRequired && !data.exam.identityVerificationEnabled ? <button className="secondary-action" type="button" onClick={() => navigate(`/candidate/${inviteToken}/mobile-proctor`)}><Video size={18} />보조 감독 카메라 열기</button> : null}
        <button className="primary-action" type="button" onClick={() => mutation.mutate()} disabled={!ready || !sessionReady || mutation.isPending || (!data.exam.identityVerificationEnabled && !examOpenReady)}>{data.exam.identityVerificationEnabled ? <IdCard size={18} /> : <FileCode2 size={18} />}{data.exam.identityVerificationEnabled ? "본인 인증" : "시험 열기"}</button>
      </section>
    </main>
  );
}

function CandidateEnvironmentError() {
  return <main className="candidate-page"><section className="candidate-panel"><h1>페이지를 찾을 수 없습니다</h1><p>초대 링크 또는 시험 상태를 확인해주세요.</p></section></main>;
}
