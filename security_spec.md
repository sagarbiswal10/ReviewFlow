# ReviewFlow Three-Tier RBAC Firestore Security Specification

## 1. Data Invariants
1. **Three-Tier Separation**:
   - **Management Admins** (`harkiratcourse36@gmail.com`, `admins/{uid}`, or `adminEmails/{email}` with `email_verified == true`) can read/list/create/update/delete all `businesses`, `publicProfiles`, `businessStats`, `qrStands`, `qrStandRequests`, `gbpConnections`, `gbpReviews`, `weeklyReports`, and read all `reviewEvents` and `aiUsageLogs`.
   - **Business Clients** (`request.auth.token.email.lower() == resource.data.clientEmail` or `ownerId == request.auth.uid`) can only read/list their own assigned business records (`businesses`, `businessStats`, `qrStands`, `qrStandRequests`, `gbpConnections`, `gbpReviews`, `weeklyReports`, `aiUsageLogs`) and can only update fields allowed by `existing().clientAccessLevel`:
     - `read_only`: zero write access to `businesses`, `publicProfiles`, or `qrStands`.
     - `qr_and_questions`: can update `qrConfig`, `questions`, `qrStands`, and `updatedAt` only.
     - `full`: can update branding, questions, QR config, `gbpSettings`, `weeklyReportConfig`, `qrStands`, `gbpConnections`, `gbpReviews`, and `updatedAt` — never `clientAccessLevel`, `enabledFeatures`, `clientEmail`, `ownerId`, or `qrStandLimit`.
    - **Walk-in Guests** can only read active `publicProfiles/{slug}` and active `qrStands` for QR tracking, create immutable `reviewEvents` and `feedbackSubmissions`, create `reviewDrafts` (`status == 'Generated'`) linked to an existing `feedbackSubmissionId`, and transition their own session's `reviewDrafts` (`Generated` -> `Edited` -> `Copied` -> `Deleted` terminal lock) without ever reading/scraping other customers' drafts.
2. **In-Store QR Stand Limit Enforcement**:
   - Every business defaults to `qrStandLimit == 4`.
   - `qrStands/{standId}` uses deterministic slot ID `{businessId}_slot_{slotNumber}` where `slotNumber >= 1` and `slotNumber <= parentBusiness.qrStandLimit`.
   - Clients can NEVER mutate `businesses.qrStandLimit` directly and can NEVER approve their own `qrStandRequests`. Only Management Admins can transition `qrStandRequests.status` from `pending` to `approved` or `rejected`.
3. **1–2 Star Rating Mandatory Manual Approval**:
   - A `gbpReviews` document with `starRating <= 2` CANNOT transition to `auto_published` via client update; manual approval (`manually_approved` / `published`) requires explicit human review action.
4. **Feedback Preservation & Draft Lifecycle Integrity**:
   - `feedbackSubmissions` are immutable (`allow update, delete: if false`) so deleting a generated `reviewDrafts` document never deletes the customer's submitted feedback.
   - `reviewDrafts` updates require matching `sessionId`, valid status transitions (`Edited`, `Copied`, `Deleted`), and lock against further mutations once `status == 'Deleted'`.
5. **PII & Secret Isolation**:
   - `clientEmail`, `address`, `phone`, and `contactEmail` never appear in `publicProfiles/{slug}`, `feedbackSubmissions/{submissionId}`, or `reviewDrafts/{draftId}`.
   - OAuth access tokens and Gemini API keys are NEVER stored in any Firestore document.

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. **Client Self-Promotion**: Business client attempts to update `clientAccessLevel` from `read_only` to `full` -> `PERMISSION_DENIED`.
2. **Client QR Stand Limit Bypass**: Client attempts to create `qrStands/{bizId}_slot_5` when `qrStandLimit == 4` -> `PERMISSION_DENIED`.
3. **Client Self-Approving Stand Request**: Client attempts to create `qrStandRequests` with `status: "approved"` or update `status` to `"approved"` -> `PERMISSION_DENIED`.
4. **Client Directly Raising `qrStandLimit`**: Client attempts to update `businesses/{bizId}.qrStandLimit` from `4` to `10` -> `PERMISSION_DENIED`.
5. **Cross-Business Read**: Client A attempts `get` or `list` on Client B's `qrStands`, `gbpReviews`, `weeklyReports`, `feedbackSubmissions`, or `reviewDrafts` -> `PERMISSION_DENIED`.
6. **Spoofed Unverified Email**: User with unverified email token matching `clientEmail` or admin email attempts read/write -> `PERMISSION_DENIED`.
7. **Shadow Field Injection**: Updating `qrStands`, `gbpReviews`, or `reviewDrafts` with extra undocumented field -> `PERMISSION_DENIED`.
8. **Low-Star Auto-Publish Bypass**: Updating a `1` or `2` star `gbpReviews` document to `replyStatus: "auto_published"` -> `PERMISSION_DENIED`.
9. **Paused QR Event / Draft Injection**: Guest attempts to create `reviewEvents`, `feedbackSubmissions`, or `reviewDrafts` for a paused QR -> `PERMISSION_DENIED`.
10. **Deleted Draft Mutation & Submission Tampering**: Guest attempts to edit a `reviewDrafts` doc whose `status == 'Deleted'`, forge another `sessionId`, or update/delete `feedbackSubmissions` -> `PERMISSION_DENIED`.
11. **Non-Admin Deleting Stand Request or Weekly Report**: Client attempts to `delete` a `qrStandRequests` or `weeklyReports` audit record -> `PERMISSION_DENIED`.
12. **Analytics & Usage Log Tampering**: Client or admin attempts to `update` or `delete` an immutable `reviewEvents` or `aiUsageLogs` doc -> `PERMISSION_DENIED`.
