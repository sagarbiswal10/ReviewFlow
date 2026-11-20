# ReviewFlow Three-Tier RBAC Firestore Security Specification

## 1. Data Invariants
1. **Three-Tier Separation**:
   - **Management Admins** (`harkiratcourse36@gmail.com` or `admins/{uid}` with `email_verified == true`) can read/list/create/update/delete all `businesses`, `publicProfiles`, `businessStats`, and read all `reviewEvents`.
   - **Business Clients** (`request.auth.token.email.lower() == resource.data.clientEmail` or `ownerId == request.auth.uid`) can only read/list their own assigned `businesses` and read their own `businessStats` (`get`), and can only update fields allowed by `existing().clientAccessLevel`:
     - `read_only`: zero write access to `businesses` or `publicProfiles`.
     - `qr_and_questions`: can update `qrConfig`, `questions`, and `updatedAt` only.
     - `full`: can update `name`, `category`, `address`, `phone`, `contactEmail`, `googleReviewUrl`, `logoDataUrl`, `branding`, `qrConfig`, `questions`, `slug`, and `updatedAt` — never `clientAccessLevel`, `enabledFeatures`, `clientEmail`, or `ownerId`.
   - **Walk-in Guests** can only read active `publicProfiles/{slug}` (`qrConfig.isActive == true`), create immutable `reviewEvents`, and increment counters by `+1` on `businessStats/{businessId}`.
2. **PII Isolation**: `clientEmail`, `address`, `phone`, and `contactEmail` never appear in `publicProfiles/{slug}`.
3. **No Privilege Escalation**: Business clients cannot modify `ownerId`, `clientEmail`, `clientAccessLevel`, `enabledFeatures`, or `admins/{uid}`.

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. **Client Self-Promotion**: Business client attempts to update `clientAccessLevel` from `read_only` to `full` -> `PERMISSION_DENIED`.
2. **Read-Only Client Mutation**: Client with `clientAccessLevel == 'read_only'` attempts to edit `questions` or `branding` -> `PERMISSION_DENIED`.
3. **Partial-Tier Bypass**: Client with `clientAccessLevel == 'qr_and_questions'` attempts to change `googleReviewUrl` or `branding` -> `PERMISSION_DENIED`.
4. **Cross-Business Read**: Client A attempts `get` or `list` on Client B's `businesses` or `businessStats` -> `PERMISSION_DENIED`.
5. **Admin Registry Tampering**: Non-admin user attempts to write `admins/{theirUid}` -> `PERMISSION_DENIED`.
6. **Spoofed Unverified Email**: User with unverified email token matching `clientEmail` or admin email attempts read/write -> `PERMISSION_DENIED`.
7. **Shadow Field Injection**: Updating `businesses` with extra undocumented field -> `PERMISSION_DENIED`.
8. **Counter Tampering on `businessStats`**: Unauthenticated guest attempts to decrement `scans` or jump `scans` by `+100` -> `PERMISSION_DENIED`.
9. **Paused QR Event Injection**: Guest attempts to create `reviewEvents` or increment `businessStats` for a paused QR -> `PERMISSION_DENIED`.
10. **Public List Scraping on `businesses`**: Unauthenticated or non-matching user attempts `list` on `businesses` -> `PERMISSION_DENIED`.
11. **Public List Scraping on `publicProfiles`**: Unauthenticated user attempts `list` on `publicProfiles` -> `PERMISSION_DENIED`.
12. **Analytics History Tampering**: Client or admin attempts to `update` or `delete` an immutable `reviewEvents` doc -> `PERMISSION_DENIED`.
