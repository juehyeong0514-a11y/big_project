import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Camera, Video } from "lucide-react";
import type { ProctorDeviceStatus } from "@dcvp/shared";
import { api } from "./api";
import { useCandidateProctorStream } from "./CandidateProctorStream";

function assertNeverStatus(status: never): never {
  throw new Error(`Unhandled proctor device status: ${status}`);
}

function proctorBannerClassName(status: ProctorDeviceStatus) {
  switch (status) {
    case "CONNECTED":
      return "ready-banner ready-banner-ok";
    case "DISCONNECTED":
    case "PERMISSION_DENIED":
      return "ready-banner ready-banner-error";
    case "WAITING":
      return "ready-banner";
    default:
      return assertNeverStatus(status);
  }
}

export function CandidateMobileProctor() {
  const { inviteToken = "" } = useParams();
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["candidate-invite", inviteToken],
    queryFn: () => api.candidateInvite(inviteToken),
    enabled: Boolean(inviteToken)
  });
  const connected = useCandidateProctorStream({
    inviteToken,
    examId: data?.exam.id ?? "",
    candidateId: data?.candidate.id ?? "",
    deviceRole: "MOBILE_AUX",
    facingMode
  });

  if (isLoading) return <main className="candidate-page">보조 감독 카메라를 준비하는 중입니다.</main>;
  if (isError || !data) {
    return (
      <main className="candidate-page">
        <section className="candidate-panel">
          <h1>페이지를 찾을 수 없습니다</h1>
          <p>초대 링크 또는 시험 상태를 확인해주세요.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="candidate-page mobile-identity-page">
      <section className="candidate-panel identity-panel">
        <div className="candidate-copy">
          <span className="eyebrow">모바일 보조 감독</span>
          <h1>휴대폰 카메라를 켜주세요</h1>
          <p>시험이 끝날 때까지 휴대폰을 거치하고 화면을 끄지 마세요. 연결 끊김과 화면 이탈은 위험 이벤트로 기록됩니다.</p>
        </div>
        <div className="mobile-proctor-preview">
          <video ref={connected.videoRef} muted playsInline autoPlay />
          <div className={proctorBannerClassName(connected.deviceStatus)}>
            <Video size={18} />
            모바일 보조캠 {connected.status}
          </div>
        </div>
        <button className="secondary-action" type="button" onClick={() => setFacingMode((mode) => (mode === "environment" ? "user" : "environment"))}>
          <Camera size={18} />
          전면/후면 전환
        </button>
      </section>
    </main>
  );
}
