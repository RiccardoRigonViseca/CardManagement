import '@servicenow/sdk/global'
import { AiAgenticWorkflow } from '@servicenow/sdk/core'

/**
 * Card Servicing Workflow — orchestrates the two card agents.
 *
 * WHY A WORKFLOW AND NOT ONE BIG AGENT
 * ------------------------------------
 * The two agents are different capability types, not just different tools:
 * one reads and reports, the other changes state under confirmation. Merging
 * them would blur the boundary that keeps every write behind a confirmation
 * gate, and would push a single agent past a manageable instruction set.
 *
 * Keeping them separate also means the read-only agent can be exposed far more
 * widely than the one that can block a card.
 *
 * THIS IS ALSO THE ROUTER
 * -----------------------
 * The orchestrator decides which agent handles each request, from the member
 * agents' descriptions and the instructions below. That is deliberate: a
 * hand-written intent classifier in front of this would duplicate the routing,
 * drift from the agents' real capabilities as tools are added, and pay for a
 * second inference. The Service Portal widget should therefore submit the
 * user's message to this workflow, not try to pre-classify it.
 *
 * TEAM MEMBERS
 * ------------
 * Deployed agent sys_ids from sn_aia_agent, as required - names or Now.ID
 * references would not resolve:
 *   Card Inquiry Agent    5bb3b52e4c314f0ca1813b1939650b88
 *   Card Operations Agent 0d55095728644f3d8e19e4f23f030f2b
 */
export const cardServicingWorkflow = AiAgenticWorkflow({
    $id: Now.ID['card_servicing_workflow'],
    name: 'Card Servicing Workflow',
    description:
        'Handles card servicing requests end to end for bank operators: finds the customer and card, reports their state, and carries out operations such as blocking a card, changing limits, toggling usage controls, updating contact details or raising a dispute. Every change is confirmed with the user first.',
    recordType: 'custom',

    // Who may invoke the workflow
    securityAcl: {
        $id: Now.ID['card_servicing_workflow_acl'],
        type: 'Specific role',
        roles: [
            '0d2ef9b1998c4670a196ed6d5809cf5d', // x_snc_card_manag_1.card_operator
            '1107851955194efaaaf52f722b9dfc4a', // x_snc_card_manag_1.card_viewer
        ],
    },

    // Caller-privilege: runs as the invoking user. Required because runAs is
    // not set, and it is what keeps the bank_id perimeter effective end to end.
    //
    // The caller's roles are masked down to this list, and that mask strips the
    // `admin` role as well - so card_admin has to be listed for internal staff
    // to keep cross-bank visibility through the workflow. Listing a role here
    // does not grant it to anyone who does not already hold it.
    dataAccess: {
        roleMap: [
            'x_snc_card_manag_1.card_operator',
            'x_snc_card_manag_1.card_viewer',
            'x_snc_card_manag_1.card_admin',
        ],
    },

    team: {
        $id: Now.ID['card_servicing_team'],
        name: 'Card Servicing Team',
        // description is auto-populated from the workflow description
        members: [
            '5bb3b52e4c314f0ca1813b1939650b88', // Card Inquiry Agent
            '0d55095728644f3d8e19e4f23f030f2b', // Card Operations Agent
        ],
    },

    versions: [
        {
            name: 'V1',
            number: 1,
            state: 'published',
            instructions: `You coordinate card servicing requests for bank operators, using two specialists: the Card Inquiry Agent for everything read-only, and the Card Operations Agent for everything that changes data.

Step 1: Establish the facts before anything else.
- Use the Card Inquiry Agent to identify the customer, the card or the transaction the request is about, and to report its current state.
- NEVER skip this step, even when the user seems to be asking for an immediate action. An operation on the wrong card is worse than a slow answer.
- If the Card Inquiry Agent finds nothing, report that and stop. Do not pass an unresolved reference to the Card Operations Agent.
- If several records match, ask the user which one they mean before continuing.

Step 2: Decide whether the request is informational or operational.
- If the user only wants to know something, present the Card Inquiry Agent's findings and finish there.
- If the user wants something changed, continue to Step 3.

Step 3: Hand over to operations with the facts from Step 1.
- Use the Card Operations Agent, passing the exact card, customer or transaction identifier confirmed in Step 1.
- The Card Operations Agent will state what it intends to change and wait for the user's confirmation. Let it do that. Never confirm on the user's behalf.
- Pass along the reason the user gave, since blocking a card requires one.

Step 4: Report back as one coherent answer.
- Combine what was found in Step 1 with what was done in Step 3, so the user sees the before and after in a single reply.
- Write in plain language with readable labels and amounts shown with their currency.
- If an operation was refused, state the reason exactly as given and explain what the user could do instead. Do not retry a refused operation with altered values.
- Never show internal record identifiers or raw data structures.

Step 5: Respect the boundaries.
- Everything is limited to the banks the user is entitled to see. If a record is not found, say it was not found within their scope rather than speculating about other banks.
- A full card number is never available anywhere in this process. Never request one and never attempt to reconstruct one.
- Creating or deleting customers, cards and transactions, and changing identifiers or amounts, is out of scope: those come from the banking source system.`,
        },
    ],

    triggerConfig: [],
})
