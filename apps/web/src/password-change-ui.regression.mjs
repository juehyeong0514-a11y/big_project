import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(sourceDirectory, "App.tsx"), "utf8");
const authSource = readFileSync(join(sourceDirectory, "apiAuth.ts"), "utf8");
const loginSource = readFileSync(join(sourceDirectory, "LoginPage.tsx"), "utf8");
const policyHintSource = readFileSync(join(sourceDirectory, "PasswordPolicyHint.tsx"), "utf8");
const policySource = readFileSync(join(sourceDirectory, "passwordPolicy.ts"), "utf8");
const passwordChangeSource = readFileSync(join(sourceDirectory, "PasswordChangePage.tsx"), "utf8");
const stylesSource = readFileSync(join(sourceDirectory, "styles.css"), "utf8");
const adminShellSource = readFileSync(join(sourceDirectory, "AdminShell.tsx"), "utf8");

if (!authSource.includes('"/api/auth/change-password"')) {
  throw new Error("The web auth client must call the password change endpoint.");
}

if (!appSource.includes("passwordChangeRequired")) {
  throw new Error("Restricted sessions must route to the password-change-only screen.");
}

if (!appSource.includes("PasswordChangePage")) {
  throw new Error("The app must render the password change screen for restricted sessions.");
}

if (!passwordChangeSource.includes('to="/privacy"') || !passwordChangeSource.includes("개인정보 처리방침")) {
  throw new Error("The restricted password change screen must link to the privacy policy.");
}

for (const source of [loginSource]) {
  if (!source.includes("minLength={12}")) {
    throw new Error("Account creation forms must require at least 12 password characters in the browser.");
  }
}

if (!loginSource.includes("PasswordPolicyHint") || !policyHintSource.includes("passwordPolicyHelpText") || !policySource.includes("12~256자, 영문 대/소문자") || !policySource.includes("3종\\u00a0이상")) {
  throw new Error("Account creation forms must explain the password policy.");
}

if (!policySource.includes("/[\\p{P}\\p{S}]/u")) {
  throw new Error("Client password policy must use the API's Unicode punctuation and symbol definition.");
}

const nulCharacterPassword = "A1\u0000ABCDEFGHI";
if (/[\p{P}\p{S}]/u.test(nulCharacterPassword)) {
  throw new Error("Control characters must not satisfy the special-character password requirement.");
}

if (!/\.login-copy p\s*\{[^}]*word-break: keep-all/u.test(stylesSource)) {
  throw new Error("Login copy must keep Korean phrases together when it wraps.");
}

if (!stylesSource.includes(".exam-table-wrap table") || stylesSource.includes("  .table-wrap table {")) {
  throw new Error("Mobile card-table styles must be scoped to the exam table.");
}

if (!adminShellSource.includes('?? "소속 없음"') || !adminShellSource.includes(".filter(Boolean).join(\" / \")")) {
  throw new Error("Admin shell must render a fallback organization name for unaffiliated sessions.");
}
