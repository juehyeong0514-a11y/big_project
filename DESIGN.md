# Developer Competency Verification Platform Design System

## 1. Direction
Operational Korean admin console for exam setup, live proctoring, candidate verification, and reporting. The UI should feel dense, calm, and work-focused rather than promotional.

## 2. Tokens
- Color: use the existing neutral surfaces, blue primary actions, amber warnings, and red danger states already declared in `apps/web/src/styles.css`.
- Type: system UI stack, compact headings in panels, no hero-scale type inside admin tools.
- Spacing: 4px base rhythm; forms and repeated cards use compact gaps.
- Radius: cards and controls stay at or below the existing 8px radius pattern.

## 3. Layout
- Admin pages use full-width constrained tool panels with tables, lists, and split grids.
- Candidate pages use a focused single task panel.
- Live proctoring uses video-first grids with status metadata attached to each candidate.

## 4. Components
- Primary actions use icon plus Korean command label.
- Sidebar items with actionable pending work show a compact red numeric badge; the badge contains a count and is never the only notification signal.
- Table navigation actions that open a detail or monitoring view use compact labeled buttons with an icon; plain text links are not used for these actions.
- Exam creation and editing use the same compact form fields and toggles so schedule and proctoring policies are edited consistently.
- Organization application starts with two compact choice cards for creating or joining an organization; each card states its approval outcome before the user proceeds.
- Organization managers see a compact code-and-invitation split panel: a copyable join code on the left and a registered-account email plus role selector on the right. The panel explicitly states that it registers an in-app invitation and does not send email. Received invitations use a single-row confirmation action.
- Password creation and forced password-change forms use the shared policy hint below the new-password input. The forced-change state is a single-task panel and includes an explicit logout action.
- Icon-only actions require `title`.
- Status badges use semantic labels and color: normal, warning, danger, connected, disconnected.
- Only the operator account list exposes a delete action. It uses the existing red danger treatment, asks for confirmation, and never appears for the signed-in operator's own row.
- Repeated candidates/questions/test cases are list items, not nested cards.

## 5. States
- Every save action must show pending, success, and failure feedback.
- Camera/proctoring states must show waiting, connected, disconnected, permission denied, and risk level.
- Dangerous actions such as exam delete require an explicit confirmation step.

## 6. Accessibility
- Buttons remain native `button` or `a`.
- Camera video regions include nearby text state.
- Do not rely on color alone for risk; always include Korean text.
