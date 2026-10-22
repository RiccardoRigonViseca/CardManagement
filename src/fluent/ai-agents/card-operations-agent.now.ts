import '@servicenow/sdk/global'
import { AiAgent } from '@servicenow/sdk/core'

/**
 * Card Operations Agent — performs changes, always with confirmation.
 *
 * EXECUTION MODE
 * --------------
 * Every writing tool is `copilot`: the user must confirm before anything
 * changes. Only the lookup tool is `autopilot`, so the agent can verify the
 * card's current state before proposing an action. In a banking context an
 * unconfirmed card block is unacceptable, so this is not negotiable.
 *
 * WHY SCRIPT TOOLS CALLING CardOperations
 * ---------------------------------------
 * CRUD tools would write to the tables directly and bypass every business
 * rule: an LLM could then block a cancelled card, set a daily limit above the
 * monthly one, or edit a transaction amount. Routing through CardOperations
 * means the model cannot violate the rules even when it is wrong — the state
 * transitions, the limit hierarchy and the editable-field whitelist are all
 * enforced server-side, and the tool simply reports the refusal back.
 *
 * PERIMETER
 * ---------
 * Runs as the invoking user with the card_operator role, so the bank_id
 * perimeter applies automatically. An operator cannot operate on another
 * bank's card even by naming it explicitly.
 */
export const cardOperationsAgent = AiAgent({
    $id: Now.ID['card_operations_agent'],
    name: 'Card Operations Agent',
    description:
        'Performs operations on cards and customers: blocking and unblocking a card, changing spending limits, toggling usage controls, updating customer contact data and raising a transaction dispute. Every change requires explicit user confirmation.',
    agentRole:
        'You are a card operations specialist for a digital banking platform. You carry out requested changes on cards and customers carefully, you always confirm before acting, and you explain plainly when an operation is refused.',

    // Who may invoke the agent: operators only. A read-only viewer must not
    // be able to start an operation at all.
    securityAcl: {
        $id: Now.ID['card_operations_agent_acl'],
        type: 'Specific role',
        roles: [
            '0d2ef9b1998c4670a196ed6d5809cf5d', // x_snc_card_manag_1.card_operator
        ],
    },

    // Caller-privilege with the caller's roles masked down to this list. The
    // `admin` role is stripped by that mask, so card_admin must be listed for
    // internal staff to retain cross-bank visibility inside the agent.
    // Listing a role does not grant it: a bank operator who does not hold
    // card_admin stays confined to its own bank_id.
    dataAccess: {
        roleMap: ['x_snc_card_manag_1.card_operator', 'x_snc_card_manag_1.card_admin'],
    },

    agentDescriptor: 'created_by_build_agent',
    channel: 'nap_and_va',
    recordType: 'custom',
    processingMessage: 'Preparing the card operation...',
    postProcessingMessage: 'The operation has been processed.',

    versionDetails: [
        {
            name: 'V1',
            number: 1,
            state: 'published',
            instructions: `You perform changes on cards and customers. Every change needs the user's explicit confirmation first.

Step 1: Identify the target precisely.
- Every operation needs an exact card identifier, or a customer identifier for a contact change, or a transaction identifier for a dispute.
- If the user refers to a card loosely, for example by the last four digits, use the Check Card Before Operating tool to resolve and confirm which card they mean.
- If more than one card could match, use collect_input_from_user to ask which one. NEVER guess.
- DO NOT PROCEED to any change until the target is unambiguous.

Step 2: Verify the current state.
- Use the Check Card Before Operating tool to read the card's present status, limits and usage controls.
- Compare the request against that state. If the card is already in the requested state, say so and stop instead of calling a change tool.

Step 3: Confirm the action with the user.
- When a card request number IS present, do NOT ask for confirmation in words. Use the Propose Card Operation tool instead: the portal shows the user the exact values and collects their approval through a dedicated control, which is clearer and leaves a proper audit trail. Asking in prose here would duplicate that and is the wrong route.
- When NO card request number is present, state exactly what will change, on which card, and why, then wait for the user to confirm before acting.
- Either way, make the consequences explicit. A permanent block is final and cannot be reversed: the card has to be reissued. Always say this before a permanent block.
- Never chain several changes from a single confirmation.

Step 4: Carry out the operation.
- FIRST decide HOW to act, by checking whether a card request number is present in the task or the context.
- IF A CARD REQUEST NUMBER IS PRESENT, you are working through the portal. Use the Propose Card Operation tool and nothing else: it records what you intend to do so the user can approve it in the portal, and the approved action is then executed for you. Do NOT use the direct operation tools in this case, and do NOT say the change has been made - say it is waiting for their approval.
- IF NO CARD REQUEST NUMBER IS PRESENT, you are in a direct conversation and act yourself using the tools below.
- To block or unblock, use the Block Or Unblock Card tool. Supply the action input as block_temporary, block_permanent or unblock, and a reason.
- The reason must be one of: customer_request, lost, stolen, fraud_suspected, damaged, never_received, issuer_decision. Ask the user which applies if it is not clear from their request.
- To change spending limits, use the Update Card Limits tool and pass only the limits the user actually asked to change.
- To turn card features on or off, use the Update Card Usage Controls tool and pass only the flags the user actually asked to change.
- To update a customer's contact details, use the Update Customer Contact Details tool. Only email, phone, country, preferred language and notes can be changed. Anything else, such as the customer's name, tax code, segment or risk level, is not editable here.
- To contest a movement, use the Dispute Transaction tool with the transaction identifier and a reason.

Step 5: Report the outcome truthfully.
- If the tool reports success, confirm in plain language what changed, showing the previous and new value.
- If the tool refuses, report the reason exactly as given and do not retry with different values hoping it passes. A refusal is a business rule, not an obstacle to work around.
- Common refusals to explain clearly: a permanently blocked card cannot be unblocked; limits cannot be changed on a cancelled or expired card; a limit cannot exceed the ceiling above it; only settled or authorized movements can be disputed.
- Never claim an operation succeeded when the tool did not confirm it.

Step 6: Stay within scope.
- You cannot create or delete cards, customers or transactions, and you cannot change identifiers, names or amounts. If asked, explain that those come from the banking source system.
- Operations are limited to the banks the user is entitled to. If a card is not found, say it was not found within their scope.`,
        },
    ],

    tools: [
        {
            active: true,
            name: 'Check Card Before Operating',
            description:
                'Reads a card so an operation can be validated before it is proposed. Accepts a card identifier or the last four digits and returns the card identity, current status, limits and usage controls.',
            type: 'script',
            recordType: 'custom',
            executionMode: 'autopilot',
            preMessage: 'Checking the current state of the card...',
            postMessage: 'Card state retrieved.',
            outputTransformationStrategy: 'none',
            inputs: [
                {
                    name: 'card_reference',
                    description:
                        'The card identifier, for example "TKN-CARD-00000004", or just the last four digits, for example "3375".',
                    mandatory: true,
                },
            ],
            script: `(function (inputs) {
    var provider = new CardDataProvider();
    var ref = ('' + inputs.card_reference).trim();

    // Exact identifier first; fall back to a search so the agent can resolve
    // a loose reference such as the last four digits.
    var card = provider.getCard(ref);
    if (card) {
        return { status: 'success', matches: 1, card: card };
    }

    var page = provider.searchCards({ query: ref }, { limit: 10 });
    if (!page.total) {
        return { status: 'not_found', message: 'No card matches "' + ref + '" within your bank scope.' };
    }
    if (page.total > 1) {
        return {
            status: 'ambiguous',
            message: page.total + ' cards match "' + ref + '". Ask the user which one before operating.',
            matches: page.total,
            cards: page.results
        };
    }
    return { status: 'success', matches: 1, card: page.results[0] };
})(inputs);`,
        },
        {
            active: true,
            name: 'Block Or Unblock Card',
            description:
                'Blocks a card temporarily or permanently, or lifts a temporary block. Requires the card identifier, the action and a reason. A permanent block is final and cannot be reversed.',
            type: 'script',
            recordType: 'custom',
            executionMode: 'copilot',
            preMessage: 'Applying the block or unblock on the card...',
            postMessage: 'Card block state processed.',
            outputTransformationStrategy: 'none',
            inputs: [
                {
                    name: 'card_id',
                    description: 'The exact card identifier to act on.',
                    mandatory: true,
                },
                {
                    name: 'action',
                    description:
                        'One of: block_temporary (reversible block), block_permanent (final, card must be reissued), unblock (lift a temporary block).',
                    mandatory: true,
                },
                {
                    name: 'reason',
                    description:
                        'Reason code. One of: customer_request, lost, stolen, fraud_suspected, damaged, never_received, issuer_decision. Required when blocking.',
                    mandatory: true,
                },
                {
                    name: 'notes',
                    description: 'Optional free-text note to store on the card.',
                    mandatory: false,
                },
            ],
            script: `(function (inputs) {
    var ops = new CardOperations();
    var action = ('' + inputs.action).toLowerCase().trim();

    if (action === 'unblock') {
        return ops.unblockCard(inputs.card_id, { reason: inputs.reason, notes: inputs.notes });
    }
    if (action === 'block_temporary') {
        return ops.blockCard(inputs.card_id, { type: 'temporary', reason: inputs.reason, notes: inputs.notes });
    }
    if (action === 'block_permanent') {
        return ops.blockCard(inputs.card_id, { type: 'permanent', reason: inputs.reason, notes: inputs.notes });
    }
    return {
        success: false,
        message: 'Invalid action "' + inputs.action + '". Use block_temporary, block_permanent or unblock.'
    };
})(inputs);`,
        },
        {
            active: true,
            name: 'Update Card Limits',
            description:
                'Changes one or more spending limits on a card. Pass only the limits that should change. The server validates the limit hierarchy and refuses inconsistent values.',
            type: 'script',
            recordType: 'custom',
            executionMode: 'copilot',
            preMessage: 'Updating the card spending limits...',
            postMessage: 'Card limits processed.',
            outputTransformationStrategy: 'none',
            inputs: [
                {
                    name: 'card_id',
                    description: 'The exact card identifier to act on.',
                    mandatory: true,
                },
                {
                    name: 'credit_limit',
                    description: 'New overall credit limit, as a number. Omit to leave unchanged.',
                    mandatory: false,
                },
                {
                    name: 'daily_limit',
                    description: 'New daily spending limit, as a number. Omit to leave unchanged.',
                    mandatory: false,
                },
                {
                    name: 'monthly_limit',
                    description: 'New monthly spending limit, as a number. Omit to leave unchanged.',
                    mandatory: false,
                },
                {
                    name: 'single_transaction_limit',
                    description: 'New maximum for a single transaction, as a number. Omit to leave unchanged.',
                    mandatory: false,
                },
                {
                    name: 'atm_daily_limit',
                    description: 'New daily ATM withdrawal limit, as a number. Omit to leave unchanged.',
                    mandatory: false,
                },
                {
                    name: 'ecommerce_limit',
                    description: 'New e-commerce spending limit, as a number. Omit to leave unchanged.',
                    mandatory: false,
                },
            ],
            script: `(function (inputs) {
    var ops = new CardOperations();
    var fields = [
        'credit_limit',
        'daily_limit',
        'monthly_limit',
        'single_transaction_limit',
        'atm_daily_limit',
        'ecommerce_limit'
    ];

    var limits = {};
    var provided = 0;
    fields.forEach(function (f) {
        var raw = inputs[f];
        if (raw === undefined || raw === null || ('' + raw).trim() === '') { return; }
        var num = parseFloat(raw);
        if (isNaN(num)) { return; }
        limits[f] = num;
        provided++;
    });

    if (!provided) {
        return { success: false, message: 'No limit supplied. Provide at least one numeric limit to change.' };
    }
    return ops.updateCardLimits(inputs.card_id, limits);
})(inputs);`,
        },
        {
            active: true,
            name: 'Update Card Usage Controls',
            description:
                'Turns card features on or off: contactless, e-commerce, ATM withdrawals, international usage and recurring payments. Pass only the flags that should change.',
            type: 'script',
            recordType: 'custom',
            executionMode: 'copilot',
            preMessage: 'Updating the card usage controls...',
            postMessage: 'Usage controls processed.',
            outputTransformationStrategy: 'none',
            inputs: [
                {
                    name: 'card_id',
                    description: 'The exact card identifier to act on.',
                    mandatory: true,
                },
                {
                    name: 'contactless_enabled',
                    description: 'true or false to allow contactless payments. Omit to leave unchanged.',
                    mandatory: false,
                },
                {
                    name: 'ecommerce_enabled',
                    description: 'true or false to allow online purchases. Omit to leave unchanged.',
                    mandatory: false,
                },
                {
                    name: 'atm_enabled',
                    description: 'true or false to allow ATM withdrawals. Omit to leave unchanged.',
                    mandatory: false,
                },
                {
                    name: 'international_enabled',
                    description: 'true or false to allow usage abroad. Omit to leave unchanged.',
                    mandatory: false,
                },
                {
                    name: 'recurring_enabled',
                    description: 'true or false to allow recurring payments. Omit to leave unchanged.',
                    mandatory: false,
                },
            ],
            script: `(function (inputs) {
    var ops = new CardOperations();
    var fields = [
        'contactless_enabled',
        'ecommerce_enabled',
        'atm_enabled',
        'international_enabled',
        'recurring_enabled'
    ];

    var controls = {};
    var provided = 0;
    fields.forEach(function (f) {
        var raw = inputs[f];
        if (raw === undefined || raw === null || ('' + raw).trim() === '') { return; }
        var s = ('' + raw).toLowerCase().trim();
        if (s === 'true' || s === '1' || s === 'yes') { controls[f] = true; provided++; }
        else if (s === 'false' || s === '0' || s === 'no') { controls[f] = false; provided++; }
    });

    if (!provided) {
        return { success: false, message: 'No usage control supplied. Provide at least one flag as true or false.' };
    }
    return ops.updateCardControls(inputs.card_id, controls);
})(inputs);`,
        },
        {
            active: true,
            name: 'Update Customer Contact Details',
            description:
                'Updates a customer contact details: email, phone, country, preferred language and notes. No other customer field can be changed through this tool.',
            type: 'script',
            recordType: 'custom',
            executionMode: 'copilot',
            preMessage: 'Updating the customer contact details...',
            postMessage: 'Customer contact details processed.',
            outputTransformationStrategy: 'none',
            inputs: [
                {
                    name: 'customer_id',
                    description: 'The exact customer identifier to update.',
                    mandatory: true,
                },
                {
                    name: 'email',
                    description: 'New email address. Omit to leave unchanged.',
                    mandatory: false,
                },
                {
                    name: 'phone',
                    description: 'New phone number. Omit to leave unchanged.',
                    mandatory: false,
                },
                {
                    name: 'country',
                    description: 'New country as a two-letter code, for example IT. Omit to leave unchanged.',
                    mandatory: false,
                },
                {
                    name: 'preferred_language',
                    description: 'New preferred language code, for example it or en. Omit to leave unchanged.',
                    mandatory: false,
                },
                {
                    name: 'notes',
                    description: 'Free-text note on the customer. Omit to leave unchanged.',
                    mandatory: false,
                },
            ],
            script: `(function (inputs) {
    var ops = new CardOperations();
    var fields = ['email', 'phone', 'country', 'preferred_language', 'notes'];

    var data = {};
    var provided = 0;
    fields.forEach(function (f) {
        var raw = inputs[f];
        if (raw === undefined || raw === null || ('' + raw).trim() === '') { return; }
        data[f] = '' + raw;
        provided++;
    });

    if (!provided) {
        return { success: false, message: 'No contact detail supplied. Provide at least one of email, phone, country, preferred language or notes.' };
    }
    return ops.updateCustomer(inputs.customer_id, data);
})(inputs);`,
        },
        {
            active: true,
            name: 'Propose Card Operation',
            description:
                'Parks a proposed operation on a Card Request case for the user to approve in the portal, without executing it. Use this instead of the direct operation tools whenever the conversation is about a Card Request case.',
            type: 'script',
            recordType: 'custom',
            executionMode: 'autopilot',
            preMessage: 'Preparing the proposal for your approval...',
            postMessage: 'Proposal recorded and waiting for your confirmation.',
            outputTransformationStrategy: 'none',
            inputs: [
                {
                    name: 'request_number',
                    description: 'The card request number from the task context, for example "CRQ0001001".',
                    mandatory: true,
                },
                {
                    name: 'action',
                    description:
                        'The operation to propose. One of: block_card, unblock_card, update_limits, update_controls, update_contact, dispute_transaction.',
                    mandatory: true,
                },
                {
                    name: 'summary',
                    description:
                        'One or two plain sentences telling the user exactly what will change and why, so they can approve with full understanding. Mention explicitly when a block is permanent and therefore final.',
                    mandatory: true,
                },
                {
                    name: 'payload',
                    description:
                        'JSON object of arguments. For block_card: {"card_id","type","reason"}. For unblock_card: {"card_id","reason"}. For update_limits: {"card_id","limits":{...}}. For update_controls: {"card_id","controls":{...}}. For update_contact: {"customer_id","data":{...}}. For dispute_transaction: {"transaction_id","reason"}.',
                    mandatory: true,
                },
            ],
            script: `(function (inputs) {
    var bridge = new CardRequestBridge();
    return bridge.proposeOperation(
        inputs.request_number,
        inputs.action,
        inputs.summary,
        inputs.payload
    );
})(inputs);`,
        },
        {
            active: true,
            name: 'Dispute Transaction',
            description:
                'Flags a card transaction as disputed. Requires the transaction identifier and a reason. Only settled or authorized transactions can be disputed, and only once.',
            type: 'script',
            recordType: 'custom',
            executionMode: 'copilot',
            preMessage: 'Raising the dispute on the transaction...',
            postMessage: 'Dispute processed.',
            outputTransformationStrategy: 'none',
            inputs: [
                {
                    name: 'transaction_id',
                    description: 'The exact transaction identifier, for example "TXN0001000042".',
                    mandatory: true,
                },
                {
                    name: 'reason',
                    description:
                        'Why the customer is contesting the movement, for example "customer does not recognise the merchant".',
                    mandatory: true,
                },
            ],
            script: `(function (inputs) {
    var ops = new CardOperations();
    return ops.disputeTransaction(inputs.transaction_id, inputs.reason);
})(inputs);`,
        },
    ],

    triggerConfig: [],
})
