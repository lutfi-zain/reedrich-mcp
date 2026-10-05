## MODIFIED Requirements

### Requirement: Read-Only Goals Listing with Pacing

The system MUST expose `GET /api/v1/goals` that returns goals for the authenticated user with pacing information, ordered by evaluated `goalCurrentAmount` descending, then `goalId` ascending. An optional `status` query parameter SHALL filter by goal status (`in_progress`, `completed`, `cancelled`).

#### Scenario: Goals with pacing data

- **GIVEN** an authenticated user with an in-progress goal targeting 10,000,000 IDR with 3,000,000 IDR saved
- **WHEN** `GET /api/v1/goals` is called
- **THEN** the response SHALL include the goal with pacing data (progress percentage, estimated completion)

#### Scenario: Goals are returned sorted by evaluated goalCurrentAmount descending

- **GIVEN** an authenticated user with goals having evaluated `goalCurrentAmount` values of `3000000`, `45000000`, and `12000000`
- **WHEN** `GET /api/v1/goals` is called
- **THEN** the returned array MUST list the goals in order `[45000000, 12000000, 3000000]`
