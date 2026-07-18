export const passwordPolicyHelpText = "12~256자, 영문 대/소문자·숫자·특수문자 중 3종\u00a0이상";

export function passwordPolicyError(password: string): string | null {
  if (password.length < 12 || password.length > 256) {
    return passwordPolicyHelpText;
  }

  const characterGroupCount = [/[A-Z]/u, /[a-z]/u, /\d/u, /[\p{P}\p{S}]/u].filter((pattern) => pattern.test(password)).length;
  return characterGroupCount >= 3 ? null : passwordPolicyHelpText;
}
