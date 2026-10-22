import '@servicenow/sdk/global'
import { Acl } from '@servicenow/sdk/core'
import { cardAdmin, cardViewer } from './roles.now'

/**
 * Card Request ACLs.
 *
 * A PARTICULAR SHAPE, FOR A PARTICULAR REASON
 * -------------------------------------------
 * Unlike the data tables, here the requester legitimately writes to the
 * record: they open it, and they approve or reject the action the agent
 * proposes. The agentic layer writes to it too — and because the agents run as
 * the invoking user, those writes arrive under the SAME identity. There is no
 * separate "agent" principal to grant rights to.
 *
 * So field-level ACLs cannot separate "what the user may change" from "what
 * the agent may change". What they CAN do, and what matters, is make the
 * case's identity unforgeable: `number`, `bank_id` and `requested_by` are
 * administrator-only, so the record cannot be re-attributed to another bank or
 * another requester after the fact. That is the property an audit depends on.
 *
 * Belt and braces: the Stamp Card Request Identity business rule overwrites
 * those same fields from the session on insert, so they are correct at birth,
 * and immutable afterwards.
 *
 * Row-level isolation comes from the query business rule on this table, not
 * from here.
 */

// ---------------------------------------------------------------- record level

Acl({
    $id: Now.ID['request_read'],
    type: 'record',
    table: 'x_snc_card_manag_1_request',
    operation: 'read',
    roles: [cardViewer],
    adminOverrides: true,
    description: 'Read card requests. Rows are limited to the user bank perimeter by the query business rule.',
})

Acl({
    $id: Now.ID['request_create'],
    type: 'record',
    table: 'x_snc_card_manag_1_request',
    operation: 'create',
    roles: [cardViewer],
    adminOverrides: true,
    description:
        'Open a card request. Granted to viewers as well: asking a question is read-only in effect, and the agent that answers is itself constrained by the caller rights.',
})

Acl({
    $id: Now.ID['request_write'],
    type: 'record',
    table: 'x_snc_card_manag_1_request',
    operation: 'write',
    roles: [cardViewer],
    adminOverrides: true,
    description:
        'Update a card request. Needed by the requester to approve or reject a proposed action, and by the agentic layer which writes under the same identity. Identity columns are protected by the field-level ACLs.',
})

Acl({
    $id: Now.ID['request_delete'],
    type: 'record',
    table: 'x_snc_card_manag_1_request',
    operation: 'delete',
    roles: [cardAdmin],
    adminOverrides: true,
    description: 'Delete a card request. Administrators only: a case is an audit record and should be closed, not erased.',
})

// ----------------------------------------------------- field level: identity

Acl({
    $id: Now.ID['request_write_number'],
    type: 'record',
    table: 'x_snc_card_manag_1_request',
    field: 'number',
    operation: 'write',
    roles: [cardAdmin],
    adminOverrides: true,
    description: 'The case number is assigned once and never rewritten.',
})

Acl({
    $id: Now.ID['request_write_bank_id'],
    type: 'record',
    table: 'x_snc_card_manag_1_request',
    field: 'bank_id',
    operation: 'write',
    roles: [cardAdmin],
    adminOverrides: true,
    description:
        'The owning bank is stamped from the session on insert and immutable afterwards. Allowing it to change would let a case be moved into another bank perimeter.',
})

Acl({
    $id: Now.ID['request_write_requested_by'],
    type: 'record',
    table: 'x_snc_card_manag_1_request',
    field: 'requested_by',
    operation: 'write',
    roles: [cardAdmin],
    adminOverrides: true,
    description:
        'The requester is stamped from the session and immutable, so a case cannot be re-attributed to someone else.',
})

Acl({
    $id: Now.ID['request_write_opened_at'],
    type: 'record',
    table: 'x_snc_card_manag_1_request',
    field: 'opened_at',
    operation: 'write',
    roles: [cardAdmin],
    adminOverrides: true,
    description: 'The opening timestamp anchors the processing time measurement, so it is not user-writable.',
})
