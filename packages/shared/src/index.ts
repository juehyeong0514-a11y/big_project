export type UserRole = "ADMIN" | "ORGANIZATION" | "PROCTOR" | "CANDIDATE";

export type AdminSignupRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export const CURRENT_PRIVACY_POLICY_VERSION = "2026-07-18" as const;

// allow: SIZE_OK - centralized public DTO contract shared by API and web clients.
export type ExamStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "ENDED" | "DELETED";

export type CandidateStatus = "INVITED" | "READY" | "IN_PROGRESS" | "COMPLETED";

export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export type QuestionType = "CODING" | "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "ESSAY";

export type CodeExecutionStatus = "SUCCESS" | "FAILED";

export type ProctorEventType =
  | "TAB_HIDDEN"
  | "TAB_VISIBLE"
  | "WINDOW_BLUR"
  | "WINDOW_FOCUS"
  | "COPY"
  | "PASTE"
  | "FULLSCREEN_EXIT"
  | "FULLSCREEN_ENTER"
  | "PRIMARY_CAMERA_CONNECTED"
  | "PRIMARY_CAMERA_DISCONNECTED"
  | "PRIMARY_CAMERA_PERMISSION_DENIED"
  | "MOBILE_CAMERA_CONNECTED"
  | "MOBILE_CAMERA_DISCONNECTED"
  | "MOBILE_CAMERA_PERMISSION_DENIED"
  | "MOBILE_PAGE_HIDDEN"
  | "MOBILE_PAGE_VISIBLE"
  | "MOBILE_PAGE_LEFT"
  | "MOBILE_NETWORK_OFFLINE"
  | "MOBILE_NETWORK_ONLINE"
  | "MOBILE_HEARTBEAT_MISSED";

export type ProctorDeviceRole = "PRIMARY_PC" | "MOBILE_AUX";

export type ProctorDeviceStatus = "WAITING" | "CONNECTED" | "DISCONNECTED" | "PERMISSION_DENIED";

export type ProctorRiskLevel = "SAFE" | "WARNING" | "DANGER";

export type ProctorActionType = "WARNING_MESSAGE" | "PAUSE_EXAM" | "RESUME_EXAM" | "TERMINATE_EXAM" | "MEMO";

export type IdentityVerificationStatus = "PENDING" | "VERIFIED" | "FAILED";
export type KycProviderDecision = "VERIFIED" | "REJECTED" | "REVIEW_REQUIRED";

export type EnvironmentCheckStatus = "PASSED" | "WARNING" | "FAILED";

export type EnvironmentCheckItemId = "browser" | "network" | "camera" | "microphone" | "screen";

export interface Organization {
  id: string;
  name: string;
  joinCode?: string;
  createdAt: string;
}

export interface AdminOrganizationOption {
  id: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId?: string;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  user: User;
  organization: Organization;
  passwordChangeRequired?: boolean;
}

export type ManageableAdminRole = "ORGANIZATION" | "PROCTOR";

export interface AdminSignupRequest {
  id: string;
  organizationName: string;
  name: string;
  email: string;
  status: AdminSignupRequestStatus;
  requestedRole: "ORGANIZATION";
  rejectionReason?: string;
  reviewedById?: string;
  approvedUserId?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface SetupStatus {
  enabled: boolean;
  reason: "READY" | "USERS_EXIST" | "DATABASE_UNAVAILABLE";
}

export interface CreateInitialAdminInput {
  organizationName: string;
  name: string;
  email: string;
  password: string;
  privacyConsentAccepted: boolean;
  privacyPolicyVersion: typeof CURRENT_PRIVACY_POLICY_VERSION;
}

export interface CreateAdminSignupRequestInput {
  organizationName: string;
  name: string;
  email: string;
  password: string;
  reason: string;
}

export interface CreateOrganizationSignupRequestInput {
  organizationName: string;
  reason: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  privacyConsentAccepted: boolean;
  privacyPolicyVersion: typeof CURRENT_PRIVACY_POLICY_VERSION;
}

export type OrganizationAccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export type RequestableOrganizationRole = "CANDIDATE" | "PROCTOR" | "ORGANIZATION";

export interface CreateOrganizationAccessRequestInput {
  joinCode: string;
  requestedRole: RequestableOrganizationRole;
  reason: string;
}

export interface ReviewOrganizationAccessRequestInput {
  action: "APPROVE" | "REJECT";
  rejectionReason?: string;
}

export interface OrganizationAccessRequest {
  id: string;
  user: Pick<User, "id" | "name" | "email">;
  organization: Organization;
  requestedRole: RequestableOrganizationRole;
  reason: string;
  status: OrganizationAccessRequestStatus;
  rejectionReason?: string;
  reviewedById?: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface PendingApprovalCount {
  readonly count: number;
}

export type OrganizationInvitationStatus = "PENDING" | "ACCEPTED" | "CANCELLED";
export type InvitableOrganizationRole = "ORGANIZATION" | "PROCTOR";

export interface CreateOrganizationInvitationInput {
  readonly email: string;
  readonly requestedRole: InvitableOrganizationRole;
}

export interface AcceptOrganizationInvitationInput {
  readonly invitationId: string;
}

export interface OrganizationInvitation {
  readonly id: string;
  readonly token: string;
  readonly organization: Organization;
  readonly email: string;
  readonly requestedRole: InvitableOrganizationRole;
  readonly status: OrganizationInvitationStatus;
  readonly createdAt: string;
  readonly acceptedAt?: string;
  readonly message: string;
}

export interface UpdateAdminUserInput {
  name: string;
  email: string;
  role: UserRole;
  organizationId?: string;
}

export interface ReviewAdminSignupRequestInput {
  action: "APPROVE" | "REJECT";
  rejectionReason?: string;
}

export interface Exam {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: ExamStatus;
  languages: string[];
  proctoringEnabled: boolean;
  identityVerificationEnabled: boolean;
  mobileCameraRequired: boolean;
  screenShareRequired: boolean;
  createdAt: string;
}

export interface Question {
  id: string;
  examId: string;
  title: string;
  description: string;
  type: QuestionType;
  points: number;
  difficulty: Difficulty;
  timeLimitMs: number;
  memoryLimitMb: number;
  choices: string[];
  expectedAnswer?: string;
  createdAt: string;
}

export interface TestCase {
  id: string;
  questionId: string;
  input: string;
  expectedOutput: string;
  isPublic: boolean;
  createdAt: string;
}

export interface Candidate {
  id: string;
  examId: string;
  name: string;
  email: string;
  status: CandidateStatus;
  inviteToken: string;
  identityPrivacyConsentVersion?: string;
  identityPrivacyConsentAcceptedAt?: string;
  createdAt: string;
}

export interface CandidateInvite {
  candidate: Candidate;
  exam: Exam;
  organization: Organization;
  questions: Question[];
  proctorDevices: ProctorDevice[];
  identityVerification?: IdentityVerification;
  environmentCheck?: EnvironmentCheck;
}

export interface Submission {
  id: string;
  examId: string;
  candidateId: string;
  questionId: string;
  language: string;
  code: string;
  score: number;
  passedTests: number;
  totalTests: number;
  testResults: JudgeTestResult[];
  submittedAt: string;
}

export interface CodeExecution {
  id: string;
  candidateId: string;
  questionId: string;
  language: string;
  code: string;
  status: CodeExecutionStatus;
  output: string;
  error?: string;
  executionTimeMs: number;
  memoryUsageMb: number;
  passedTests: number;
  totalTests: number;
  testResults: JudgeTestResult[];
  createdAt: string;
}

export interface JudgeTestResult {
  id: string;
  codeExecutionId?: string;
  submissionId?: string;
  testIndex: number;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  error?: string;
  executionTimeMs: number;
  isPublic: boolean;
  createdAt: string;
}

export interface ProctorEvent {
  id: string;
  candidateId: string;
  examId: string;
  type: ProctorEventType;
  detail?: string;
  createdAt: string;
}

export interface ProctorDevice {
  id: string;
  candidateId: string;
  examId: string;
  role: ProctorDeviceRole;
  status: ProctorDeviceStatus;
  connectedAt?: string;
  disconnectedAt?: string;
  lastHeartbeatAt?: string;
  detail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProctorAction {
  id: string;
  candidateId: string;
  examId: string;
  type: ProctorActionType;
  message: string;
  createdAt: string;
}

export interface IdentityVerification {
  id: string;
  candidateId: string;
  examId: string;
  documentCaptureConfirmed: boolean;
  documentImageName: string;
  faceImageCaptured: boolean;
  provider: string;
  providerDecision: KycProviderDecision;
  providerReferenceId: string;
  failureReason?: string;
  similarityScore: number;
  documentAuthenticityScore: number;
  faceMatchScore: number;
  livenessScore: number;
  ocrNameMatched: boolean;
  verificationChecks: string[];
  privacyConsentVersion?: string;
  privacyConsentAcceptedAt?: string;
  status: IdentityVerificationStatus;
  verifiedAt?: string;
  createdAt: string;
}

export interface EnvironmentCheckResult {
  id: EnvironmentCheckItemId;
  status: EnvironmentCheckStatus;
  detail?: string;
}

export interface EnvironmentCheck {
  id: string;
  candidateId: string;
  examId: string;
  results: EnvironmentCheckResult[];
  requiredPassed: boolean;
  createdAt: string;
}

export interface EnvironmentCheckSession {
  sessionId: string;
  evidenceToken: string;
  expiresAt: string;
  requiredItems: EnvironmentCheckItemId[];
}

export interface ExamSession {
  id: string;
  candidateId: string;
  examId: string;
  startedAt: string;
  endsAt: string;
  completedAt?: string;
  serverNow: string;
  remainingSeconds: number;
}

export interface CodeDraft {
  id: string;
  candidateId: string;
  examId: string;
  questionId: string;
  language: string;
  code: string;
  savedAt: string;
  createdAt: string;
}

export interface InviteEmailLog {
  id: string;
  candidateId: string;
  examId: string;
  email: string;
  inviteUrl: string;
  provider: string;
  providerMessageId?: string;
  status: "SENT" | "FAILED";
  message: string;
  sentAt?: string;
  createdAt: string;
}

export interface QuestionWithTestCases extends Question {
  testCases: TestCase[];
}

export interface CandidateWorkspace extends CandidateInvite {
  submissions: Submission[];
  executions: CodeExecution[];
  proctorEvents: ProctorEvent[];
  proctorActions: ProctorAction[];
  examSession: ExamSession;
  drafts: CodeDraft[];
}

export interface CandidateExamReport {
  candidate: Candidate;
  submissions: Submission[];
  executions: CodeExecution[];
  latestSubmission?: Submission;
  latestExecution?: CodeExecution;
  latestAiReport?: CompetencyReport;
  latestIdentityVerification?: IdentityVerification;
  latestEnvironmentCheck?: EnvironmentCheck;
  bestScore: number;
  submissionCount: number;
  executionCount: number;
  riskEventCount: number;
  riskScore: number;
  riskLevel: ProctorRiskLevel;
  proctorEvents: ProctorEvent[];
  proctorDevices: ProctorDevice[];
  proctorActions: ProctorAction[];
  aiReports: CompetencyReport[];
  inviteEmailLogs: InviteEmailLog[];
}

export interface ExamReport {
  exam: Exam;
  candidates: CandidateExamReport[];
}

export interface CodeRunInput {
  questionId: string;
  language: string;
  code: string;
}

export interface CodeSubmitInput {
  questionId: string;
  language: string;
  code: string;
}

export interface SaveCodeDraftInput {
  questionId: string;
  language: string;
  code: string;
}

export interface CreateProctorEventInput {
  type: ProctorEventType;
  detail?: string;
}

export interface UpsertProctorDeviceInput {
  role: ProctorDeviceRole;
  status: ProctorDeviceStatus;
  detail?: string;
}

export interface LiveProctorCandidateState {
  candidate: Candidate;
  riskScore: number;
  riskLevel: ProctorRiskLevel;
  proctorEvents: ProctorEvent[];
  proctorDevices: ProctorDevice[];
  proctorActions: ProctorAction[];
}

export interface LiveProctorExamState {
  exam: Exam;
  candidates: LiveProctorCandidateState[];
}

export interface CreateIdentityVerificationInput {
  documentImageName?: string;
  documentCaptured: boolean;
  faceImageCaptured: boolean;
  livenessConfirmed: boolean;
  providerSessionId?: string;
  documentUploadRef?: string;
  faceUploadRef?: string;
}

export interface IdentityPrivacyConsentInput {
  privacyConsentAccepted: boolean;
  privacyPolicyVersion: typeof CURRENT_PRIVACY_POLICY_VERSION;
}

export interface IdentityProviderSession {
  provider: string;
  providerSessionId: string;
  documentUploadRef: string;
  faceUploadRef: string;
  expiresAt: string;
}

export interface CreateEnvironmentCheckInput {
  sessionId: string;
  evidenceToken: string;
  results: EnvironmentCheckResult[];
  browserEvidence: {
    userAgent: string;
    secureContext: boolean;
    checkedAt: string;
  };
}

export interface CompetencyReport {
  id: string;
  examSessionId: string;
  candidateId: string;
  examId: string;
  problemSolvingScore: number;
  implementationScore: number;
  debuggingScore: number;
  codeQualityScore: number;
  timeManagementScore: number;
  integrityScore: number;
  overallScore: number;
  aiSummary: string;
  strengths: string[];
  improvementAreas: string[];
  recommendations: string[];
  createdAt: string;
}

export interface ExamDetail extends Exam {
  questions: QuestionWithTestCases[];
  candidates: Candidate[];
}

export interface DashboardSummary {
  organization: Organization;
  totalExams: number;
  activeExams: number;
  totalCandidates: number;
  pendingReports: number;
  recentExams: Exam[];
}

export interface MobileAccessInfo {
  host: string;
  webBaseUrl: string;
  apiBaseUrl: string;
}

export type OperationsReadinessStatus = "READY" | "WARNING" | "ACTION_REQUIRED";

export interface OperationsReadinessCheck {
  id: string;
  label: string;
  status: OperationsReadinessStatus;
  detail: string;
  action: string;
}

export interface OperationsReadiness {
  generatedAt: string;
  overallStatus: OperationsReadinessStatus;
  checks: OperationsReadinessCheck[];
}

export interface InviteEmailResult {
  candidateId: string;
  email: string;
  inviteUrl: string;
  delivered: boolean;
  provider: string;
  providerMessageId?: string;
  message: string;
  log?: InviteEmailLog;
}

export interface CreateExamInput {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  languages: string[];
  proctoringEnabled: boolean;
  identityVerificationEnabled: boolean;
  mobileCameraRequired: boolean;
  screenShareRequired: boolean;
}

export type UpdateExamInput = CreateExamInput;

export interface CreateQuestionInput {
  title: string;
  description: string;
  type: QuestionType;
  points: number;
  difficulty: Difficulty;
  timeLimitMs: number;
  memoryLimitMb: number;
  choices: string[];
  expectedAnswer?: string;
}

export interface CreateTestCaseInput {
  input: string;
  expectedOutput: string;
  isPublic: boolean;
}

export interface CreateCandidateInput {
  name: string;
  email: string;
}

export interface CreateProctorActionInput {
  type: ProctorActionType;
  message: string;
}

export interface GenerateReportInput {
  examSessionId: string;
  candidateId: string;
  examId: string;
  signals: {
    submissions: number;
    passedTests: number;
    failedTests: number;
    codeRuns: number;
    pasteEvents: number;
    riskScore: number;
    elapsedMinutes: number;
  };
}
