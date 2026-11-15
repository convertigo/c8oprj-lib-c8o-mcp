# SQL connector rules that matter

Read when: SQL connector rules that matter. Summary: `convertigo://guides/sql`.
Previous: `convertigo://guides/sql/overview`. Next: `convertigo://guides/sql/sql-variable-semantics-you-must-not-guess`.

---

## SQL connector rules that matter

### Connector owns connection mechanics
The connector should own:
- JDBC driver class
- JDBC URL
- username/password or JNDI reference
- connection-test behavior

The business sequence should not own these concerns.

### Prefer portable connector guidance
When the project does not explicitly require a vendor-specific behavior:
- use the canonical driver for the chosen DB
- keep the JDBC URL explicit
- document any required project `libs/` jar when the driver is not shipped

### Connection testing is not optional on unfamiliar setups
If the environment is new or driver-specific:
- test the connector early
- confirm the connection test behavior before writing a lot of transaction logic

## SQL transaction patterns
