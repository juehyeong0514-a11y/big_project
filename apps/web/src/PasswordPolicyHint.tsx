import { passwordPolicyHelpText } from "./passwordPolicy";

export function PasswordPolicyHint({ id }: { readonly id?: string }) {
  return <p className="password-policy-hint" id={id}>{passwordPolicyHelpText}</p>;
}
