import { useEffect, useRef, type RefObject } from "react";
import QRCode from "qrcode";
import { AlertCircle, Camera, CheckCircle2, ScanFace, ShieldCheck, Upload } from "lucide-react";
import { api } from "./api";

type IdentityVerificationState = Awaited<ReturnType<typeof api.candidateInvite>>["identityVerification"];

export function QrCodeCanvas({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, value, { errorCorrectionLevel: "M", margin: 1, width: 156, color: { dark: "#111827", light: "#ffffff" } });
  }, [value]);
  return <canvas ref={canvasRef} className="qr-canvas" aria-label="모바일 본인 인증 QR 코드" />;
}

export function IdentityCaptureControls(props: {
  documentProvided: boolean;
  faceCaptured: boolean;
  livenessConfirmed: boolean;
  verified: boolean;
  verification?: IdentityVerificationState;
  videoRef: RefObject<HTMLVideoElement>;
  cameraFacingMode?: "user" | "environment";
  onDocument: () => void;
  onFace: () => void;
  onLiveness: () => void;
  onToggleCamera?: () => void;
}) {
  const videoClassName = props.cameraFacingMode === "user" ? "identity-camera-preview identity-camera-preview-mirrored" : "identity-camera-preview";
  return (
    <div className="identity-grid">
      <label className="identity-card"><div className="environment-icon"><Upload size={20} /></div><div><strong>신분증 촬영</strong><p>{props.documentProvided || props.verification?.documentCaptureConfirmed ? "신분증 촬영이 확인되었습니다." : "후면 카메라로 신분증을 촬영해주세요."}</p></div><input type="file" accept="image/*" capture="environment" onChange={props.onDocument} disabled={props.verified} /></label>
      <div className="identity-card"><div className="environment-icon"><ScanFace size={20} /></div><div><strong>얼굴 촬영</strong><p>{props.faceCaptured || props.verification?.faceImageCaptured ? "얼굴 촬영이 완료되었습니다." : "전면 카메라를 기본으로 얼굴을 촬영해주세요."}</p></div><div className="identity-camera"><video ref={props.videoRef} className={videoClassName} muted playsInline />{props.onToggleCamera ? <button className="secondary-action" type="button" onClick={props.onToggleCamera} disabled={props.verified}><Camera size={18} />전면/후면 전환</button> : null}<button className="secondary-action" type="button" onClick={props.onFace} disabled={props.verified}><Camera size={18} />얼굴 촬영</button></div></div>
      <div className="identity-card"><div className="environment-icon"><ShieldCheck size={20} /></div><div><strong>라이브니스 확인</strong><p>{props.livenessConfirmed || props.verification?.livenessScore ? "실시간 얼굴 확인이 완료되었습니다." : "눈 깜빡임과 얼굴 방향 전환을 확인해주세요."}</p></div><button className="secondary-action" type="button" onClick={props.onLiveness} disabled={props.verified || !props.faceCaptured}><ScanFace size={18} />확인</button></div>
    </div>
  );
}

export function IdentityResult({ verification, verified }: { verification?: IdentityVerificationState; verified: boolean }) {
  if (!verification) return <div className="ready-banner"><AlertCircle size={18} />신분증, 얼굴 촬영, 라이브니스 확인을 완료한 뒤 인증을 진행해주세요.</div>;
  const failureText = verification.failureReason ? ` / 사유: ${verification.failureReason}` : "";
  return (
    <div className={verified ? "ready-banner ready-banner-ok" : "ready-banner"}>
      {verified ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      {verified ? "본인 인증이 완료되었습니다." : "본인 인증에 실패했습니다."} Provider {verification.providerDecision} / 참조 {verification.providerReferenceId} / 신분증 {verification.documentAuthenticityScore}점 / 얼굴 {verification.faceMatchScore}점 / 라이브니스 {verification.livenessScore}점{failureText}
    </div>
  );
}
