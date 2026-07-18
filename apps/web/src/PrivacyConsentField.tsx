import { Link } from "react-router-dom";

export function PrivacyConsentField(props: {
  readonly checked: boolean;
  readonly describedBy: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <div className="privacy-consent" id={props.describedBy}>
      <label className="privacy-consent-check">
        <input
          checked={props.checked}
          onChange={(event) => props.onChange(event.target.checked)}
          required
          type="checkbox"
        />
        <span>
          <strong>[필수] 개인정보 수집·이용에 동의합니다.</strong>
          <small>이름·이메일·비밀번호 해시를 계정 생성과 서비스 제공 목적으로 계정 삭제 시까지 처리합니다.</small>
        </span>
      </label>
      <Link to="/privacy" target="_blank" rel="noreferrer">개인정보 처리방침 전문 보기</Link>
    </div>
  );
}
