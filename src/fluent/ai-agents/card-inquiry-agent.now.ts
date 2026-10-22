import '@servicenow/sdk/global'
import { AiAgent } from '@servicenow/sdk/core'

/**
 * Card Inquiry Agent — read-only.
 *
 * WHY SCRIPT TOOLS AND NOT CRUD TOOLS
 * -----------------------------------
 * Tool discovery found no reusable skill, subflow, action, catalog item or
 * topic, but it did find CardDataProvider. Script tools that call it are
 * therefore the right choice, and deliberately so: CRUD tools would query the
 * tables directly and bypass the adapter, which is the layer that keeps the
 * contract stable when the MVP tables are replaced by Digital Banking ESB
 * calls. Going through the provider means this agent needs no change on that
 * day.
 *
 * PERIMETER
 * ---------
 * The agent runs as the invoking user (Dynamic User), restricted to the
 * card_viewer role. The bank_id perimeter therefore applies automatically
 * through the query business rules and CardPerimeter: an operator of one bank
 * physically cannot retrieve another bank's data, even by asking directly.
 */
export const cardInquiryAgent = AiAgent({
    $id: Now.ID['card_inquiry_agent'],
    name: 'Card Inquiry Agent',
    description:
        'Looks up banking customers, their cards and card transactions. Answers questions about card status, limits, usage controls and recent movements. Read-only: it never changes data.',
    agentRole:
        'You are a card servicing specialist for a digital banking platform. You help bank operators find customers, inspect their cards and review card transactions quickly and accurately.',

    // Who may invoke the agent
    securityAcl: {
        $id: Now.ID['card_inquiry_agent_acl'],
        type: 'Specific role',
        roles: [
            '0d2ef9b1998c4670a196ed6d5809cf5d', // x_snc_card_manag_1.card_operator
            '1107851955194efaaaf52f722b9dfc4a', // x_snc_card_manag_1.card_viewer
        ],
    },

    // Caller-privilege: runs as the invoking user, but with the caller's roles
    // MASKED DOWN to the list below. That masking is easy to underestimate:
    // the `admin` role is stripped too, so CardPerimeter cannot rely on it
    // inside an agent. card_admin must therefore be listed here, otherwise no
    // caller could ever obtain cross-bank visibility through the agent --
    // internal staff included.
    //
    // Listing a role here does NOT grant it: a caller who does not hold
    // card_admin gains nothing, so a bank operator stays confined to its own
    // bank_id exactly as before.
    dataAccess: {
        roleMap: ['x_snc_card_manag_1.card_viewer', 'x_snc_card_manag_1.card_admin'],
    },

    agentDescriptor: 'created_by_build_agent',
    channel: 'nap_and_va',
    recordType: 'custom',
    processingMessage: 'Looking up the customer and card information...',
    postProcessingMessage: 'Here is what I found.',

    versionDetails: [
        {
            name: 'V1',
            number: 1,
            state: 'published',
            instructions: `You answer questions about banking customers, their cards and card transactions. You never modify anything.

Step 1: Understand what the user is looking for.
- If the user gives a person or company name, use the Find Customers By Name tool with the name input.
- If the user gives a card identifier, the last four digits, or a cardholder name, use the Find Cards tool with the search_text input.
- If the user gives an exact card identifier and wants its details, use the Get Card Details tool with the card_id input.
- Extract only the essential words for searching. Do NOT pass a whole sentence as the search text.
- If the request is ambiguous, use collect_input_from_user to ask which customer or card they mean before searching.

Step 2: Expand the context when useful.
- Once you have a customer identifier, use the Get Customer Overview tool with the customer_id input to report how many cards the customer holds, the overall exposure and whether any disputes are open.
- Once you have a card identifier, use the Get Card Transactions tool with the card_id input to list recent movements. Pass the optional status, date_from, date_to and disputed_only inputs only when the user asked to narrow the list.

Step 3: Handle empty results honestly.
- If a tool returns no results, say so plainly and suggest a broader search term.
- Never invent a customer, card or transaction that a tool did not return.
- Results are automatically limited to the banks the user is entitled to see. If something is not found, say it was not found within their scope - do not speculate that it belongs to another bank.

Step 4: Present the results.
- Write in plain language, as a short bulleted list. Use readable labels such as Status, Credit limit, Available credit, Expiry date.
- Show amounts with their currency, and dates in a readable form.
- Replace internal codes with their meaning: for example a temporarily blocked card is "Temporarily blocked", a permanently blocked card is "Permanently blocked".
- When listing several cards or transactions, give each one a numbered heading with its key details as sub-bullets.
- Identify a card only by its identifier and its last four digits. A full card number is never available and must never be requested or guessed.
- Never show internal record identifiers or raw JSON.

Step 5: Stay within scope.
- You cannot block cards, change limits, toggle usage controls or raise disputes. If the user asks for any of those, explain that you only provide information and that the operation must be performed by the card operations capability.`,
        },
    ],

    tools: [
        {
            active: true,
            name: 'Find Customers By Name',
            description:
                'Searches banking customers by full or partial name. Returns the customer identifier, name, type, segment, status, KYC status and contact details for each match.',
            type: 'script',
            recordType: 'custom',
            executionMode: 'autopilot',
            preMessage: 'Searching for matching customers...',
            postMessage: 'Customer search completed.',
            outputTransformationStrategy: 'none',
            inputs: [
                {
                    name: 'name',
                    description: 'Full or partial customer name to search for, for example "Rossi" or "NordTech".',
                    mandatory: true,
                },
                {
                    name: 'limit',
                    description: 'Maximum number of customers to return. Defaults to 10.',
                    mandatory: false,
                },
            ],
            script: `(function (inputs) {
    var provider = new CardDataProvider();
    var limit = parseInt(inputs.limit, 10);
    if (isNaN(limit) || limit <= 0) { limit = 10; }

    var page = provider.searchCustomers({ name: inputs.name }, { limit: limit });

    if (!page.total) {
        return { status: 'empty', message: 'No customer matches "' + inputs.name + '" within your bank scope.', customers: [] };
    }
    return { status: 'success', total: page.total, returned: page.results.length, customers: page.results };
})(inputs);`,
        },
        {
            active: true,
            name: 'Get Customer Overview',
            description:
                'Returns a consolidated overview of one customer: profile, how many cards they hold broken down by status, total credit exposure, and open disputes. Requires the customer identifier.',
            type: 'script',
            recordType: 'custom',
            executionMode: 'autopilot',
            preMessage: 'Building the customer overview...',
            postMessage: 'Customer overview ready.',
            outputTransformationStrategy: 'none',
            inputs: [
                {
                    name: 'customer_id',
                    description: 'The customer identifier, for example "CUS1001002".',
                    mandatory: true,
                },
            ],
            script: `(function (inputs) {
    var provider = new CardDataProvider();
    var summary = provider.getCustomerSummary(inputs.customer_id);

    if (!summary) {
        return { status: 'not_found', message: 'Customer ' + inputs.customer_id + ' was not found within your bank scope.' };
    }
    return { status: 'success', overview: summary };
})(inputs);`,
        },
        {
            active: true,
            name: 'Find Cards',
            description:
                'Searches cards by card identifier, last four digits, cardholder name or customer identifier. Optionally filters by status. Returns identity, product, status, limits and usage controls for each match.',
            type: 'script',
            recordType: 'custom',
            executionMode: 'autopilot',
            preMessage: 'Searching for matching cards...',
            postMessage: 'Card search completed.',
            outputTransformationStrategy: 'none',
            inputs: [
                {
                    name: 'search_text',
                    description:
                        'Card identifier, last four digits, or cardholder name. Use a single short term, not a sentence.',
                    mandatory: false,
                },
                {
                    name: 'customer_id',
                    description: 'Restrict the search to the cards of this customer identifier.',
                    mandatory: false,
                },
                {
                    name: 'status',
                    description:
                        'Optional status filter. One or more of: requested, issued, active, blocked_temporary, blocked_permanent, expired, cancelled. Separate multiple values with commas.',
                    mandatory: false,
                },
                {
                    name: 'limit',
                    description: 'Maximum number of cards to return. Defaults to 20.',
                    mandatory: false,
                },
            ],
            script: `(function (inputs) {
    var provider = new CardDataProvider();
    var limit = parseInt(inputs.limit, 10);
    if (isNaN(limit) || limit <= 0) { limit = 20; }

    var criteria = {};
    if (inputs.search_text) { criteria.query = inputs.search_text; }
    if (inputs.customer_id) { criteria.customer_id = inputs.customer_id; }
    if (inputs.status) { criteria.status = inputs.status; }

    if (!criteria.query && !criteria.customer_id && !criteria.status) {
        return { status: 'error', message: 'Provide at least a search text, a customer identifier or a status filter.' };
    }

    var page = provider.searchCards(criteria, { limit: limit });

    if (!page.total) {
        return { status: 'empty', message: 'No card matches those criteria within your bank scope.', cards: [] };
    }
    return { status: 'success', total: page.total, returned: page.results.length, cards: page.results };
})(inputs);`,
        },
        {
            active: true,
            name: 'Get Card Details',
            description:
                'Returns the full detail of a single card from its identifier: product, lifecycle status and reason, expiry, all spending limits and all usage control flags.',
            type: 'script',
            recordType: 'custom',
            executionMode: 'autopilot',
            preMessage: 'Retrieving the card details...',
            postMessage: 'Card details retrieved.',
            outputTransformationStrategy: 'none',
            inputs: [
                {
                    name: 'card_id',
                    description: 'The card identifier, for example "TKN-CARD-00000003".',
                    mandatory: true,
                },
            ],
            script: `(function (inputs) {
    var provider = new CardDataProvider();
    var summary = provider.getCardSummary(inputs.card_id);

    if (!summary) {
        return { status: 'not_found', message: 'Card ' + inputs.card_id + ' was not found within your bank scope.' };
    }
    return { status: 'success', card: summary.card, activity: summary.transactions, utilisation_percent: summary.utilisation };
})(inputs);`,
        },
        {
            active: true,
            name: 'Get Card Transactions',
            description:
                'Lists the transactions of one card, newest first. Requires the card identifier. Optionally filters by status, date range or disputed-only. Returns amounts, merchant, channel and authorization detail.',
            type: 'script',
            recordType: 'custom',
            executionMode: 'autopilot',
            preMessage: 'Retrieving the card transactions...',
            postMessage: 'Transactions retrieved.',
            outputTransformationStrategy: 'none',
            inputs: [
                {
                    name: 'card_id',
                    description: 'The card identifier whose transactions should be listed.',
                    mandatory: true,
                },
                {
                    name: 'status',
                    description:
                        'Optional status filter. One or more of: pending, authorized, settled, declined, reversed, refunded, disputed. Separate multiple values with commas.',
                    mandatory: false,
                },
                {
                    name: 'date_from',
                    description: 'Optional start of the period, in the form YYYY-MM-DD HH:MM:SS.',
                    mandatory: false,
                },
                {
                    name: 'date_to',
                    description: 'Optional end of the period, in the form YYYY-MM-DD HH:MM:SS.',
                    mandatory: false,
                },
                {
                    name: 'disputed_only',
                    description: 'Set to true to return only transactions already flagged as disputed.',
                    mandatory: false,
                },
                {
                    name: 'limit',
                    description: 'Maximum number of transactions to return. Defaults to 20.',
                    mandatory: false,
                },
            ],
            script: `(function (inputs) {
    var provider = new CardDataProvider();
    var limit = parseInt(inputs.limit, 10);
    if (isNaN(limit) || limit <= 0) { limit = 20; }

    var filters = {};
    if (inputs.status) { filters.status = inputs.status; }
    if (inputs.date_from) { filters.dateFrom = inputs.date_from; }
    if (inputs.date_to) { filters.dateTo = inputs.date_to; }
    if (('' + inputs.disputed_only).toLowerCase() === 'true') { filters.disputedOnly = true; }

    var page = provider.getTransactionsByCard(inputs.card_id, filters, { limit: limit });

    if (!page.total) {
        return { status: 'empty', message: 'No transaction found for card ' + inputs.card_id + ' with those filters, within your bank scope.', transactions: [] };
    }
    return { status: 'success', card_id: page.card_id, total: page.total, returned: page.results.length, transactions: page.results };
})(inputs);`,
        },
    ],

    triggerConfig: [],
})
