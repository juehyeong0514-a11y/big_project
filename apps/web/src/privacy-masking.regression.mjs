import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  maskAddress,
  maskCardNumber,
  maskDisplayName,
  maskEmailAddress,
  maskIpAddress,
  maskPhoneNumber,
  maskResidentRegistrationNumber
} from "./privacyMasking.ts";

const source = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

// Given: administrator and proctor screens that render other people's identifiers.
// When: their source is inspected for display-boundary handling.
// Then: raw name and email expressions are not rendered directly.
assert.doesNotMatch(source("./AdminUsers.tsx"), /\{request\.(name|email)\}/u);
assert.doesNotMatch(source("./CandidateManager.tsx"), /\{candidate\.email\}/u);
assert.doesNotMatch(source("./AdminReportPanel.tsx"), /\{item\.candidate\.(name|email)\}/u);
assert.doesNotMatch(source("./AiEvaluation.tsx"), /\{item\.candidate\.(name|email)\}/u);
assert.doesNotMatch(source("./LiveProctorCard.tsx"), /\{candidate\.candidate\.(name|email)\}/u);
assert.doesNotMatch(source("./OrganizationInvitationsPanel.tsx"), /\{invitation\.email\}/u);

const candidateIdentitySource = source("./CandidateFlow.tsx");
assert.match(candidateIdentitySource, /본인확인 개인정보·생체인식정보 처리에 동의합니다/u);
assert.match(candidateIdentitySource, /!privacyConsentAccepted/u);
assert.match(candidateIdentitySource, /privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION/u);
assert.match(source("./PrivacyPolicyPage.tsx"), /얼굴·라이브니스 신호는 본인확인 목적으로 설정된 KYC 전문 업체에 전송됩니다/u);
assert.match(source("./LoginPage.css"), /line-break: strict/u);
assert.match(source("./LoginPage.css"), /overflow-wrap: normal/u);
assert.match(source("./LoginPage.css"), /word-break: keep-all/u);
assert.match(source("./PrivacyPolicyPage.tsx"), /계정&nbsp;삭제&nbsp;시까지/u);
assert.match(source("./PrivacyPolicyPage.tsx"), /이용할&nbsp;수&nbsp;없습니다/u);

assert.equal(maskDisplayName("김민수"), "김*수");
assert.equal(maskDisplayName("현우"), "현*");
assert.equal(maskEmailAddress("master@example.com"), "ma****@example.com");
assert.equal(maskPhoneNumber("010-1234-0913"), "010-****-0913");
assert.equal(maskResidentRegistrationNumber("040101-3123456"), "040101-******* ".trim());
assert.equal(maskCardNumber("4558123456780116"), "4558-12**-****-0116");
assert.equal(maskAddress("서울시 성북구 북악산로123 101동 1004호"), "서울시 성북구 북악산로*** ***동 ****호");
assert.equal(maskIpAddress("123.123.45.123"), "123.123.***.123");

console.log("privacy masking UI regression passed");
