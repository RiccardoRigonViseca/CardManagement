import '@servicenow/sdk/global'
import { Property } from '@servicenow/sdk/core'

/**
 * Sys_id of the Card Servicing Workflow the bridge submits requests to.
 *
 * Kept as a property rather than hardcoded in CardRequestBridge because the
 * sys_id differs per instance: a dev, test and production deployment each have
 * their own workflow record. Hardcoding it would silently submit to a
 * non-existent workflow after a clone or a fresh install.
 */
Property({
    $id: Now.ID['servicing_workflow_id'],
    name: 'x_snc_card_manag_1.servicing_workflow_id',
    type: 'string',
    value: 'f215eff539074814a426218d63036cae',
    description:
        'Sys_id of the Card Servicing Workflow (sn_aia_usecase) that CardRequestBridge submits card requests to. Update this after installing on a new instance, where the workflow receives a different sys_id.',
    roles: {
        read: ['admin'],
        write: ['admin'],
    },
})

/**
 * How long a pending approval stays valid.
 *
 * An approval that never expires is a latent risk: a card block approved from
 * context the operator saw hours ago may no longer be the right action.
 */
Property({
    $id: Now.ID['approval_timeout_minutes'],
    name: 'x_snc_card_manag_1.approval_timeout_minutes',
    type: 'integer',
    value: 30,
    description:
        'Minutes a proposed card operation stays open for user confirmation before it is treated as expired. Prevents an operator from approving an action based on stale context.',
    roles: {
        read: ['admin'],
        write: ['admin'],
    },
})

/**
 * How many prior turns of a conversation are replayed to the agent.
 *
 * The runtime cannot resume a conversation, so continuity comes from replaying
 * history as context. More turns means better recall but a larger prompt, and
 * contextMemory is a bounded field — an unbounded history would eventually be
 * truncated mid-JSON and reach the agent corrupted.
 */
Property({
    $id: Now.ID['history_turns'],
    name: 'x_snc_card_manag_1.history_turns',
    type: 'integer',
    value: 6,
    description:
        'How many earlier turns of the same conversation are replayed to the agent as context. Raise for better recall at the cost of a larger prompt; contextMemory is size-bounded, so very large values risk truncation.',
    roles: {
        read: ['admin'],
        write: ['admin'],
    },
})
