import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Copy,
  FileCode2,
  IdCard,
  MonitorUp,
  ShieldCheck,
  Smartphone,
  Video,
} from "lucide-react";
import { api } from "./api";
import { Status } from "./components";
import { IdentityCaptureControls, IdentityResult, QrCodeCanvas } from "./CandidateIdentityParts";
import { CURRENT_PRIVACY_POLICY_VERSION } from "@dcvp/shared";
import type { IdentityProviderSession, ProctorDevice } from "@dcvp/shared";

function useIdentityProviderSession(inviteToken: string, privacyConsentAccepted: boolean) {
  const [session, setSession] = useState<IdentityProviderSession | null>(null);
  const getSession = async () => {
    if (session) return session;
    const nextSession = await api.createIdentityProviderSession(inviteToken, { privacyConsentAccepted, privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION });
    setSession(nextSession);
    return nextSession;
  };
  return { getSession, session };
}

function hasConnectedMobileProctor(proctorDevices: readonly ProctorDevice[]) {
  return proctorDevices.some((device) => device.role === "MOBILE_AUX" && device.status === "CONNECTED");
}

export function CandidateEntry() {
  const { inviteToken = "" } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({ queryKey: ["candidate-invite", inviteToken], queryFn: () => api.candidateInvite(inviteToken), enabled: Boolean(inviteToken), refetchInterval: 3000 });
  const mutation = useMutation({
    mutationFn: () => api.markCandidateReady(inviteToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["candidate-invite", inviteToken] });
      navigate(`/candidate/${inviteToken}/check`);
    }
  });
  if (isLoading) return <main className="candidate-page">초대 정보를 불러오는 중입니다.</main>;
  if (isError || !data) return <CandidateError />;
  return (
    <main className="candidate-page">
      <section className="candidate-panel">
        <div className="candidate-header">
          <div className="brand login-brand"><ShieldCheck size={28} /><div><strong>DCVP</strong><span>{data.organization.name}</span></div></div>
          <Status status={data.candidate.status} />
        </div>
        <div className="candidate-copy">
          <span className="eyebrow">응시자 입장</span>
          <h1>{data.exam.title}</h1>
          <p>{data.exam.description}</p>
        </div>
        <div className="candidate-summary">
          <span><CalendarDays size={16} />{data.exam.durationMinutes}분</span>
          <span><ShieldCheck size={16} />본인 인증 {data.exam.identityVerificationEnabled ? "필수" : "없음"}</span>
          <span><MonitorUp size={16} />화면 점검 {data.exam.screenShareRequired ? "필수" : "선택"}</span>
        </div>
        <button className="primary-action" type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          <FileCode2 size={18} />입장 확인
        </button>
      </section>
    </main>
  );
}

export function CandidateIdentityVerification() {
  const { inviteToken = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({ queryKey: ["candidate-invite", inviteToken], queryFn: () => api.candidateInvite(inviteToken), enabled: Boolean(inviteToken), refetchInterval: 3000 });
  const { data: mobileAccess } = useQuery({ queryKey: ["mobile-access"], queryFn: api.mobileAccess });
  if (isLoading) return <main className="candidate-page">본인 인증 정보를 불러오는 중입니다.</main>;
  if (isError || !data) return <CandidateError />;
  const verification = data.identityVerification;
  const verified = verification?.status === "VERIFIED";
  const mobileProctorConnected = hasConnectedMobileProctor(data.proctorDevices);
  const examOpenReady = verified && (!data.exam.mobileCameraRequired || mobileProctorConnected);
  const mobileBaseUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? mobileAccess?.webBaseUrl ?? window.location.origin : window.location.origin;
  const mobileIdentityUrl = `${mobileBaseUrl}/candidate/${inviteToken}/mobile-identity`;
  const mobileProctorUrl = `${mobileBaseUrl}/candidate/${inviteToken}/mobile-proctor`;
  return (
    <main className="candidate-page">
      <section className="candidate-panel identity-panel">
        <div className="candidate-copy"><span className="eyebrow">본인 인증</span><h1>모바일에서 촬영을 완료해주세요</h1><p>PC 화면은 QR 링크와 인증 상태만 표시합니다. 휴대폰에서 신분증과 얼굴 촬영을 완료하면 이 화면이 자동으로 완료 상태를 감지합니다.</p></div>
        <div className="mobile-identity-card"><div className="environment-icon"><Smartphone size={20} /></div><div><strong>모바일 본인 인증</strong><p>휴대폰 카메라로 QR을 스캔하거나 링크를 열어 촬영을 완료해주세요.</p><p className="mobile-access-hint">같은 Wi-Fi 테스트는 아래 LAN 주소로 접속합니다. 실제 휴대폰 카메라 인증은 HTTPS 운영 주소에서 진행해주세요.</p><code>{verified ? mobileProctorUrl : mobileIdentityUrl}</code></div><QrCodeCanvas value={verified ? mobileProctorUrl : mobileIdentityUrl} /><button className="secondary-action" type="button" onClick={() => navigator.clipboard.writeText(verified ? mobileProctorUrl : mobileIdentityUrl)}><Copy size={18} />링크 복사</button></div>
        <IdentityResult verification={verification} verified={verified} />
        {data.exam.mobileCameraRequired ? <div className={mobileProctorConnected ? "ready-banner ready-banner-ok" : "ready-banner"}><Video size={18} />{mobileProctorConnected ? "모바일 보조캠이 연결되었습니다." : "시험 시작 전 모바일 보조캠을 연결해주세요."}</div> : null}
        <div className="identity-actions"><button className="secondary-action" type="button" onClick={() => navigate(`/candidate/${inviteToken}/mobile-proctor`)} disabled={!verified}><Video size={18} />보조 감독 카메라 열기</button><button className="primary-action" type="button" onClick={() => navigate(`/candidate/${inviteToken}/exam`)} disabled={!examOpenReady}><FileCode2 size={18} />시험 열기</button></div>
      </section>
    </main>
  );
}

export function CandidateMobileIdentityVerification() {
  const { inviteToken = "" } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { data, isLoading, isError } = useQuery({ queryKey: ["candidate-invite", inviteToken], queryFn: () => api.candidateInvite(inviteToken), enabled: Boolean(inviteToken) });
  const [documentProvided, setDocumentProvided] = useState(false);
  const [faceCaptured, setFaceCaptured] = useState(false);
  const [livenessConfirmed, setLivenessConfirmed] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");
  const [privacyConsentAccepted, setPrivacyConsentAccepted] = useState(false);
  const identitySession = useIdentityProviderSession(inviteToken, privacyConsentAccepted);
  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };
  const startCamera = async () => {
    stopCamera();
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: cameraFacingMode } });
    streamRef.current = stream;
    setCameraActive(true);
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  };
  const captureFace = async () => {
    if (!cameraActive) await startCamera();
    setFaceCaptured(true);
  };
  const toggleCamera = () => {
    stopCamera();
    setCameraFacingMode((mode) => (mode === "user" ? "environment" : "user"));
  };
  const mutation = useMutation({
    mutationFn: async () => {
      const session = await identitySession.getSession();
      return api.verifyCandidateIdentity(inviteToken, {
        providerSessionId: session.providerSessionId,
        documentUploadRef: session.documentUploadRef,
        faceUploadRef: session.faceUploadRef,
        documentCaptured: documentProvided,
        faceImageCaptured: faceCaptured,
        livenessConfirmed
      });
    }
  });
  if (isLoading) return <main className="candidate-page">모바일 본인 인증을 불러오는 중입니다.</main>;
  if (isError || !data) return <CandidateError />;
  const verification = mutation.data ?? data.identityVerification;
  const verified = verification?.status === "VERIFIED";
  return (
    <main className="candidate-page mobile-identity-page">
      <section className="candidate-panel identity-panel">
        <div className="candidate-copy"><span className="eyebrow">모바일 촬영</span><h1>신분증과 얼굴을 촬영해주세요</h1><p>완료되면 PC 시험 화면에서 자동으로 인증 상태가 반영됩니다.</p></div>
        <div className="privacy-consent">
          <label className="privacy-consent-check">
            <input type="checkbox" checked={privacyConsentAccepted} onChange={(event) => setPrivacyConsentAccepted(event.target.checked)} disabled={verified} />
            <span><strong>[필수] 본인확인 개인정보·생체인식정보 처리에 동의합니다.</strong><small>신분증 정보, 얼굴 영상과 라이브니스 신호는 본인확인 목적으로 설정된 KYC 전문 업체에 전송됩니다. 플랫폼은 원본을 저장하지 않고 판정·점수·참조값과 동의 기록만 보관합니다.</small></span>
          </label>
          <Link to="/privacy" target="_blank" rel="noreferrer">개인정보 처리방침 및 위탁 안내 보기</Link>
        </div>
        <IdentityCaptureControls documentProvided={documentProvided} faceCaptured={faceCaptured} livenessConfirmed={livenessConfirmed} verified={verified} verification={verification} videoRef={videoRef} cameraFacingMode={cameraFacingMode} onDocument={() => setDocumentProvided(true)} onFace={() => void captureFace()} onLiveness={() => setLivenessConfirmed(true)} onToggleCamera={toggleCamera} />
        <IdentityResult verification={verification} verified={verified} />
        <div className="identity-actions">
          <button className="primary-action" type="button" onClick={() => mutation.mutate()} disabled={verified || mutation.isPending || !privacyConsentAccepted || !documentProvided || !faceCaptured || !livenessConfirmed}><IdCard size={18} />인증 완료하기</button>
          <button className="secondary-action" type="button" onClick={() => navigate(`/candidate/${inviteToken}/mobile-proctor`)} disabled={!verified}><Video size={18} />보조 감독 카메라 열기</button>
        </div>
      </section>
    </main>
  );
}

export function CandidateError() {
  return <main className="candidate-page"><section className="candidate-panel"><h1>페이지를 열 수 없습니다</h1><p>초대 링크 또는 시험 상태를 확인해주세요.</p></section></main>;
}
