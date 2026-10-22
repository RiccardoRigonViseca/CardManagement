/**
 * Query business rule: restrict rows to the current user's bank perimeter.
 *
 * Runs on EVERY query against the table, which is exactly the point: it covers
 * list views, the Table API, reports, flows and AI agents -- not just callers
 * that go through CardDataProvider. Without this, a bank user who opened the
 * table list directly would see every bank's rows.
 *
 * CardPerimeter is the shared resolver, so this rule and the provider can never
 * disagree. It fails closed: a user with no Bank Access mapping gets an
 * impossible filter rather than an unfiltered query.
 */
;(function executeRule(current, previous) {
    new CardPerimeter().applyTo(current)
})(current, previous)
