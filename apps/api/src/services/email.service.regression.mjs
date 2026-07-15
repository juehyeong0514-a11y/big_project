import assert from "node:assert/strict";
import { renderInviteEmail } from "../../dist/services/email-template.js";

const content = renderInviteEmail({
  candidateId: "candidate_<>&\"'",
  candidateName: "홍길동 <script>alert(\"x\")</script>",
  email: "candidate@example.com",
  examTitle: "백엔드 <>&\"' 평가",
  inviteUrl: "https://exam.example.com/candidate/invite?name=<>&\"'"
});

assert.equal(content.subject, "[DCVP] 백엔드 <>&\"' 평가 시험 초대");
assert.match(content.html, /홍길동 &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;님/);
assert.match(content.html, /백엔드 &lt;&gt;&amp;&quot;&#39; 평가/);
assert.match(content.html, /https:\/\/exam.example.com\/candidate\/invite\?name=&lt;&gt;&amp;&quot;&#39;/);
assert.doesNotMatch(content.html, /<script>/);
assert.doesNotMatch(content.html, /name=<>&"'/);
assert.match(content.text, /홍길동 <script>alert\("x"\)<\/script>님/);

console.log("email html escaping regression passed");
