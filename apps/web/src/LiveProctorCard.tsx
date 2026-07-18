import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquareWarning, Pause, Play, Square, StickyNote } from "lucide-react";
import type { CreateProctorActionInput, LiveProctorCandidateState } from "@dcvp/shared";
import { api } from "./api";
import { LiveProctorVideoTile } from "./LiveProctorVideoTile";
import { proctorActionLabel, proctorEventLabel, proctorEventTone, proctorStreamKey, riskLabel } from "./proctoring";
import { maskDisplayName, maskEmailAddress } from "./privacyMasking";

export function LiveProctorCard({ candidate, streams }: { readonly candidate: LiveProctorCandidateState; readonly streams: Readonly<Record<string, MediaStream>> }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const primaryKey = proctorStreamKey(candidate.candidate.id, "PRIMARY_PC");
  const mobileKey = proctorStreamKey(candidate.candidate.id, "MOBILE_AUX");
  const primaryDevice = candidate.proctorDevices.find((device) => device.role === "PRIMARY_PC");
  const mobileDevice = candidate.proctorDevices.find((device) => device.role === "MOBILE_AUX");
  const actionMutation = useMutation({
    mutationFn: (input: CreateProctorActionInput) => api.createProctorAction(candidate.candidate.id, input),
    onSuccess: async () => {
      setMessage("");
      await queryClient.invalidateQueries({ queryKey: ["proctor-live", candidate.candidate.examId] });
      await queryClient.invalidateQueries({ queryKey: ["exam-report", candidate.candidate.examId] });
    }
  });
  const submitAction = (type: CreateProctorActionInput["type"], fallback: string) => {
    actionMutation.mutate({ type, message: message || fallback });
  };

  return (
    <article className={`live-proctor-card risk-${candidate.riskLevel.toLowerCase()}`}>
      <div className="live-proctor-header">
        <div>
          <strong>{maskDisplayName(candidate.candidate.name)}</strong>
          <span>{maskEmailAddress(candidate.candidate.email)}</span>
        </div>
        <span className={`risk-badge risk-${candidate.riskLevel.toLowerCase()}`}>{riskLabel(candidate.riskLevel)} {candidate.riskScore}</span>
      </div>
      <div className="video-pair">
        <LiveProctorVideoTile label="PC 캠" stream={streams[primaryKey]} status={primaryDevice?.status ?? "WAITING"} />
        <LiveProctorVideoTile label="모바일 보조캠" stream={streams[mobileKey]} status={mobileDevice?.status ?? "WAITING"} />
      </div>
      <div className="event-strip">
        {candidate.proctorEvents.length ? (
          candidate.proctorEvents.slice(0, 4).map((event) => (
            <span key={event.id} className={`event-pill event-${proctorEventTone(event.type)}`}>{proctorEventLabel(event.type)}</span>
          ))
        ) : <span className="event-pill event-safe">최근 이벤트 없음</span>}
      </div>
      <div className="proctor-action-panel">
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="경고 또는 감독관 메모" />
        <div className="proctor-action-buttons">
          <button type="button" className="secondary-action" onClick={() => submitAction("WARNING_MESSAGE", "시험 화면과 카메라 상태를 확인해주세요.")} disabled={actionMutation.isPending}><MessageSquareWarning size={16} />경고</button>
          <button type="button" className="secondary-action" onClick={() => submitAction("MEMO", "감독관 검토 메모")} disabled={actionMutation.isPending}><StickyNote size={16} />메모</button>
          <button type="button" className="secondary-action" onClick={() => submitAction("PAUSE_EXAM", "감독관이 시험을 일시중지했습니다.")} disabled={actionMutation.isPending}><Pause size={16} />일시중지</button>
          <button type="button" className="secondary-action" onClick={() => submitAction("RESUME_EXAM", "감독관이 시험을 재개했습니다.")} disabled={actionMutation.isPending}><Play size={16} />재개</button>
          <button type="button" className="danger-action" onClick={() => submitAction("TERMINATE_EXAM", "감독관이 시험을 강제 종료했습니다.")} disabled={actionMutation.isPending}><Square size={16} />강제종료</button>
        </div>
        {candidate.proctorActions.length ? (
          <div className="action-timeline">
            {candidate.proctorActions.slice(0, 3).map((action) => <span key={action.id}>{proctorActionLabel(action.type)}: {action.message}</span>)}
          </div>
        ) : null}
      </div>
    </article>
  );
}
