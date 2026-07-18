# KYC Sandbox Provider Contract

The platform no longer creates mock identity scores. Identity verification must call the configured KYC sandbox provider and store only the returned decision metadata. Raw ID and face media should stay in the provider pipeline or object storage behind short-lived references.

## Environment

```env
KYC_SANDBOX_API_BASE_URL=https://sandbox.kyc-provider.example.com
KYC_SANDBOX_API_KEY=replace-me
```

## Request

Before final verification, the platform creates a provider-owned session and upload references.

```http
POST /identity/sessions
Authorization: Bearer <KYC_SANDBOX_API_KEY>
Content-Type: application/json
```

```json
{
  "candidate": {
    "id": "candidate_001",
    "name": "Kim Minjun"
  },
  "examId": "exam_backend_001",
  "requiredChecks": ["DOCUMENT_AUTHENTICITY", "FACE_MATCH", "LIVENESS", "OCR_NAME_MATCH"]
}
```

```json
{
  "provider": "kyc-sandbox",
  "providerSessionId": "provider_session_123",
  "documentUploadRef": "provider_document_ref",
  "faceUploadRef": "provider_face_ref",
  "expiresAt": "2026-07-12T10:30:00.000Z"
}
```

The browser must use these provider-issued references. It must not create local fake `kyc_session_*`, `kyc_document_ref_*`, or `kyc_face_ref_*` values.

```http
POST /identity/verify
Authorization: Bearer <KYC_SANDBOX_API_KEY>
Content-Type: application/json
```

```json
{
  "candidate": {
    "id": "candidate_001",
    "name": "Kim Minjun"
  },
  "examId": "exam_backend_001",
  "providerSessionId": "provider_session_123",
  "documentUploadRef": "provider_document_ref",
  "faceUploadRef": "provider_face_ref",
  "captureSignals": {
    "documentCaptured": true,
    "faceImageCaptured": true,
    "livenessConfirmed": true
  }
}
```

## Response

```json
{
  "provider": "kyc-sandbox",
  "providerDecision": "VERIFIED",
  "providerReferenceId": "verification_ref_123",
  "documentAuthenticityScore": 92,
  "faceMatchScore": 88,
  "livenessScore": 91,
  "ocrNameMatched": true,
  "verificationChecks": [
    "DOCUMENT_AUTHENTICITY",
    "FACE_MATCH",
    "LIVENESS",
    "OCR_NAME_MATCH"
  ]
}
```

## Platform Decision

The platform marks a candidate as `VERIFIED` only when all conditions pass:

- `documentAuthenticityScore >= 85`
- `faceMatchScore >= 80`
- `livenessScore >= 80`
- `ocrNameMatched === true`
- `providerDecision === VERIFIED`
- `verificationChecks`에 `DOCUMENT_AUTHENTICITY`, `FACE_MATCH`, `LIVENESS`, `OCR_NAME_MATCH`가 모두 포함됨

Otherwise the identity result is stored as `FAILED`.

## Production Media Flow

1. Mobile browser starts a provider verification session.
2. Provider SDK or hosted page captures ID and face media.
3. Provider stores raw media under its compliance controls.
4. Provider returns a session ID, upload references, or final score payload to this platform.
5. This platform stores only the score payload, check list, timestamps, and decision state.
