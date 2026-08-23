## MODIFIED Requirements

### Requirement: Active Debts and Loans Resource
The system SHALL expose an MCP resource at URI `reedrich://debts/active` returning a JSON list of all active (`unpaid` and `partially_paid`) debts and loans for the authenticated user.

#### Scenario: Read active debts and loans via MCP resource URI
- **WHEN** an authenticated client reads resource `reedrich://debts/active`
- **THEN** the system MUST return a JSON list containing all unsettled debts and loans with calculated totals for total remaining debt and total outstanding loans
