export const privacyContact = {
  officerName: import.meta.env.VITE_PRIVACY_OFFICER_NAME?.trim() || "개인정보 보호책임자 미설정",
  email: import.meta.env.VITE_PRIVACY_CONTACT_EMAIL?.trim() || "배포 환경에서 문의 이메일을 설정해야 합니다."
} as const;
