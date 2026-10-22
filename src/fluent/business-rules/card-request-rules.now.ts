import '@servicenow/sdk/global'
import { BusinessRule } from '@servicenow/sdk/core'

/**
 * Card Request lifecycle rules.
 *
 * Two rules, both `before`, with deliberately different scopes:
 *
 *   Stamp Card Request Identity — the trust boundary. Overwrites bank_id and
 *   requested_by from the session on insert, so a portal widget cannot open a
 *   case against a bank it is not entitled to.
 *
 *   Close Card Request — case hygiene. Keeps closure timestamp, duration and
 *   outcome consistent whenever the state changes, so a closed case is never
 *   half-closed.
 *
 * Note on the state field: these rules do not block or revert transitions.
 * If you later need to forbid specific moves (for example reopening a case
 * closed as Refused), that belongs in a State Model rather than here, where it
 * would be declarative and auditable instead of scripted.
 */

BusinessRule({
    $id: Now.ID['stamp_card_request_identity'],
    name: 'Stamp Card Request Identity',
    table: 'x_snc_card_manag_1_request',
    when: 'before',
    action: ['insert'],
    order: 100,
    active: true,
    description:
        'Trust boundary for card requests. Forces requested_by to the current user and resolves bank_id from the Bank Access entitlement, aborting when the caller is not entitled to the bank. Also seeds opened_at, state and the summary.',
    script: Now.include('../../server/business-rules/stamp-card-request.js'),
})

BusinessRule({
    $id: Now.ID['close_card_request'],
    name: 'Close Card Request',
    table: 'x_snc_card_manag_1_request',
    when: 'before',
    action: ['update'],
    filterCondition: 'stateVALCHANGES^ORconfirmation_stateVALCHANGES',
    order: 100,
    active: true,
    description:
        'Keeps a closed card request internally consistent: stamps closed_at and the measured processing time, derives the outcome when the agentic layer did not state one, expires a pending approval, and records who confirmed.',
    script: Now.include('../../server/business-rules/close-card-request.js'),
})
