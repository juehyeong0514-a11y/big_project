import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Video, Volume2 } from "lucide-react";
import { io } from "socket.io-client";
import type { ProctorDeviceRole } from "@dcvp/shared";
import { api } from "./api";
import { LiveProctorCard } from "./LiveProctorCard";
import {
  createProctorPeerConnection,
  playDangerTone,
  proctorSocketUrl,
  proctorStreamKey,
  type ProctorSignalPayload
} from "./proctoring";
import { sessionTokenStore } from "./sessionTokenStore";

const proctorDeviceRoles = ["PRIMARY_PC", "MOBILE_AUX"] as const satisfies readonly ProctorDeviceRole[];
type RiskFilter = "ALL" | "WARNING_OR_HIGHER" | "DANGER";
type ProctorDeviceJoinedPayload = {
  readonly candidateId: string;
  readonly deviceRole: ProctorDeviceRole;
};

export function LiveProctorDashboard() {
  const { examId = "" } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["proctor-live", examId],
    queryFn: () => api.proctorLive(examId),
    enabled: Boolean(examId),
    refetchInterval: 5000
  });
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("ALL");
  const dangerCountRef = useRef(0);

  useEffect(() => {
    if (!examId) return;
    const socket = io(proctorSocketUrl(), { auth: { token: sessionTokenStore.get() ?? "" }, transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-admin", { examId });
    });
    socket.on("webrtc-offer", (payload: ProctorSignalPayload) => {
      if (!payload.description) return;
      const key = proctorStreamKey(payload.candidateId, payload.deviceRole);
      peersRef.current[key]?.close();
      const connection = createProctorPeerConnection((candidate) => {
        socket.emit("ice-candidate", { ...payload, candidate } satisfies ProctorSignalPayload);
      });
      peersRef.current[key] = connection;
      connection.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;
        setStreams((previous) => ({ ...previous, [key]: stream }));
      };
      void connection
        .setRemoteDescription(payload.description)
        .then(() => connection.createAnswer())
        .then((answer) => connection.setLocalDescription(answer).then(() => answer))
        .then((answer) => {
          socket.emit("webrtc-answer", { ...payload, description: answer } satisfies ProctorSignalPayload);
        });
    });
    socket.on("ice-candidate", (payload: ProctorSignalPayload) => {
      if (!payload.candidate) return;
      const key = proctorStreamKey(payload.candidateId, payload.deviceRole);
      void peersRef.current[key]?.addIceCandidate(payload.candidate);
    });
    socket.on("device-joined", (payload: ProctorDeviceJoinedPayload) => {
      socket.emit("request-offer", {
        examId,
        candidateId: payload.candidateId,
        deviceRole: payload.deviceRole
      } satisfies ProctorSignalPayload);
    });
    socket.on("device-left", (payload: { candidateId: string; deviceRole: ProctorDeviceRole }) => {
      const key = proctorStreamKey(payload.candidateId, payload.deviceRole);
      peersRef.current[key]?.close();
      setStreams((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    });

    return () => {
      socket.disconnect();
      Object.values(peersRef.current).forEach((peer) => peer.close());
      peersRef.current = {};
      setStreams({});
    };
  }, [examId]);

  useEffect(() => {
    if (!data || !socketRef.current) return;
    data.candidates.forEach((candidate) => {
      proctorDeviceRoles.forEach((deviceRole) => {
        socketRef.current?.emit("request-offer", {
          examId: data.exam.id,
          candidateId: candidate.candidate.id,
          deviceRole
        } satisfies ProctorSignalPayload);
      });
    });
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const dangerCount = data.candidates.filter((candidate) => candidate.riskLevel === "DANGER").length;
    if (dangerCount > dangerCountRef.current) playDangerTone();
    dangerCountRef.current = dangerCount;
  }, [data]);

  if (isLoading) return <div className="panel">실시간 감독 화면을 불러오는 중입니다.</div>;
  if (isError || !data) return <div className="panel">실시간 감독 정보를 불러오지 못했습니다.</div>;

  const dangerCount = data.candidates.filter((candidate) => candidate.riskLevel === "DANGER").length;
  const warningOrHigherCount = data.candidates.filter((candidate) => candidate.riskLevel !== "SAFE").length;
  const displayedCandidates = data.candidates.filter((candidate) => {
    if (riskFilter === "DANGER") return candidate.riskLevel === "DANGER";
    if (riskFilter === "WARNING_OR_HIGHER") return candidate.riskLevel !== "SAFE";
    return true;
  });

  return (
    <div className="stack">
      <section className="panel hero-panel">
        <div>
          <span className="eyebrow">실시간 감독</span>
          <h2>{data.exam.title}</h2>
          <p>응시자 PC 캠과 QR 인증 휴대폰 보조캠을 함께 확인합니다. 영상은 저장하지 않고 연결 상태와 위험 이벤트만 기록합니다.</p>
        </div>
        <div className="proctor-toolbar">
          <div className="policy-row">
            <span><Video size={16} />응시자 {data.candidates.length}명</span>
            <span><Volume2 size={16} />위험 알림 사용</span>
            <Link className="secondary-action" to={`/exams/${data.exam.id}`}>시험 상세</Link>
          </div>
          <div className="proctor-filter-row" aria-label="감독 위험도 필터">
            <button type="button" className={riskFilter === "ALL" ? "active" : ""} onClick={() => setRiskFilter("ALL")}>전체 {data.candidates.length}</button>
            <button type="button" className={riskFilter === "WARNING_OR_HIGHER" ? "active" : ""} onClick={() => setRiskFilter("WARNING_OR_HIGHER")}>주의 이상 {warningOrHigherCount}</button>
            <button type="button" className={riskFilter === "DANGER" ? "active danger" : ""} onClick={() => setRiskFilter("DANGER")}>위험 {dangerCount}</button>
          </div>
        </div>
      </section>
      <section className="live-proctor-grid">
        {displayedCandidates.length ? displayedCandidates.map((candidate) => (
          <LiveProctorCard key={candidate.candidate.id} candidate={candidate} streams={streams} />
        )) : <div className="live-proctor-empty"><strong>표시할 응시자가 없습니다.</strong><span>응시자가 시험에 입장하거나 현재 필터 조건을 바꾸면 이곳에 표시됩니다.</span></div>}
      </section>
    </div>
  );
}
