import { useEffect, useRef } from "react";
import { XCircle } from "lucide-react";
import type { ProctorDeviceStatus } from "@dcvp/shared";
import { proctorDeviceStatusLabel } from "./proctoring";

export function LiveProctorVideoTile({ label, stream, status }: { readonly label: string; readonly stream?: MediaStream; readonly status: ProctorDeviceStatus }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream ?? null;
  }, [stream]);
  const placeholderText = status === "CONNECTED" ? "영상 수신 대기" : proctorDeviceStatusLabel(status);

  return (
    <div className="proctor-video-tile">
      {stream ? <video ref={videoRef} muted playsInline autoPlay /> : <div className="video-placeholder"><XCircle size={20} />{placeholderText}</div>}
      <div><strong>{label}</strong><span>{proctorDeviceStatusLabel(status)}</span></div>
    </div>
  );
}
