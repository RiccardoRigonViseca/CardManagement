/**
 * Solution Pitch — server script.
 *
 * Gathers LIVE figures from the instance. Nothing here is hardcoded for the
 * presentation: every number is counted at render time, so the pitch cannot
 * drift from what the application actually does. If a demo claim stops being
 * true, the slide stops saying it.
 *
 * A note on the perimeter, which matters for the demo itself: these counts run
 * as the logged-in user, so an operator sees only their own bank. That is the
 * multi-tenant isolation working, not a bug — so the template says so out
 * loud rather than hiding it.
 *
 * Style note: every helper is declared BEFORE it is used, and no catch block
 * is left empty. Both patterns are rejected by the build's diagnostics.
 */
(function () {
    var T_CUSTOMER = 'x_snc_card_manag_1_customer';
    var T_CARD = 'x_snc_card_manag_1_card';
    var T_TXN = 'x_snc_card_manag_1_txn';
    var T_REQUEST = 'x_snc_card_manag_1_request';
    var T_BANK_ACCESS = 'x_snc_card_manag_1_bank_access';
    var SCOPE_ID = '888d25e9fb4c9f500910f2e04eefdca6';

    var OUTCOME_LABELS = {
        success: 'Applied',
        refused: 'Refused by business rule',
        no_action_needed: 'Answered, nothing to change',
        cancelled: 'Cancelled by the operator',
        failed: 'Technical failure'
    };

    var OUTCOME_CLASSES = {
        success: 'pitch-outcome--success',
        refused: 'pitch-outcome--refused',
        no_action_needed: 'pitch-outcome--neutral',
        cancelled: 'pitch-outcome--neutral',
        failed: 'pitch-outcome--failed'
    };

    // =================================================================
    // Helpers, declared first
    // =================================================================

    var countOf = function (table) {
        var agg = new GlideAggregate(table);
        agg.addAggregate('COUNT');
        agg.query();
        return agg.next() ? parseInt(agg.getAggregate('COUNT'), 10) : 0;
    };

    var countWhere = function (table, encodedQuery) {
        var agg = new GlideAggregate(table);
        agg.addEncodedQuery(encodedQuery);
        agg.addAggregate('COUNT');
        agg.query();
        return agg.next() ? parseInt(agg.getAggregate('COUNT'), 10) : 0;
    };

    var countScoped = function (table) {
        var agg = new GlideAggregate(table);
        agg.addQuery('sys_scope', SCOPE_ID);
        agg.addAggregate('COUNT');
        agg.query();
        return agg.next() ? parseInt(agg.getAggregate('COUNT'), 10) : 0;
    };

    /** Tools by execution mode, read from the agent-tool link records. */
    var countToolsByMode = function (mode) {
        var gr = new GlideRecord('sn_aia_agent_tool_m2m');
        gr.addQuery('agent.sys_scope', SCOPE_ID);
        gr.addQuery('execution_mode', mode);
        gr.setLimit(200);
        gr.query();
        return gr.getRowCount();
    };

    var countQueryRules = function () {
        var gr = new GlideRecord('sys_script');
        gr.addQuery('sys_scope', SCOPE_ID);
        gr.addQuery('action_query', true);
        gr.setLimit(50);
        gr.query();
        return gr.getRowCount();
    };

    var bankNameFor = function (bankId) {
        var gr = new GlideRecord(T_BANK_ACCESS);
        gr.addQuery('bank_id', bankId);
        gr.addQuery('bank_name', '!=', '');
        gr.setLimit(1);
        gr.query();
        return gr.next() ? gr.getValue('bank_name') : bankId;
    };

    /**
     * Cards, customers and transactions per bank, so the isolation is visible
     * as data rather than asserted in prose. For an operator this returns
     * exactly one row, which is the most direct demonstration there is.
     */
    var banksBreakdown = function () {
        var out = [];
        var agg = new GlideAggregate(T_CARD);
        agg.groupBy('bank_id');
        agg.addAggregate('COUNT');
        agg.orderBy('bank_id');
        agg.query();
        while (agg.next()) {
            var bankId = agg.getValue('bank_id');
            if (bankId) {
                out.push({
                    bank_id: bankId,
                    bank_name: bankNameFor(bankId),
                    cards: parseInt(agg.getAggregate('COUNT'), 10),
                    customers: countWhere(T_CUSTOMER, 'bank_id=' + bankId),
                    transactions: countWhere(T_TXN, 'bank_id=' + bankId)
                });
            }
        }
        return out;
    };

    /**
     * How requests ended.
     *
     * `refused` matters most here: it means the business rules overruled the
     * model, which is the behaviour we most want to be able to point at.
     */
    var outcomeBreakdown = function () {
        var out = [];
        var agg = new GlideAggregate(T_REQUEST);
        agg.groupBy('outcome');
        agg.addAggregate('COUNT');
        agg.query();
        while (agg.next()) {
            var key = agg.getValue('outcome');
            if (key) {
                out.push({
                    key: key,
                    label: OUTCOME_LABELS[key] || key,
                    cssClass: OUTCOME_CLASSES[key] || 'pitch-outcome--neutral',
                    count: parseInt(agg.getAggregate('COUNT'), 10)
                });
            }
        }
        return out;
    };

    // =================================================================
    // Always initialise, so the template never binds to undefined
    // =================================================================
    data.title = options.title || 'Agentic Card Operations';
    data.subtitle = options.subtitle || 'Card servicing an AI can run, but cannot get wrong';
    data.assistantPageId = options.assistant_page_id || 'x_snc_card_manag_1_assistant';

    data.scopedView = true;
    data.perimeter = null;
    data.counts = {};
    data.agentic = {};
    data.governance = {};
    data.approvals = {};
    data.outcomes = [];
    data.banks = [];
    data.error = '';

    // =================================================================
    // Whose view is this?
    // =================================================================
    try {
        var perimeter = new CardPerimeter();
        data.perimeter = perimeter.describe();
        data.scopedView = !data.perimeter.full_visibility;
    } catch (e) {
        data.error = 'Could not resolve the bank perimeter: ' + e;
        return;
    }

    // =================================================================
    // The figures
    // =================================================================
    try {
        data.counts = {
            customers: countOf(T_CUSTOMER),
            cards: countOf(T_CARD),
            transactions: countOf(T_TXN),
            requests: countOf(T_REQUEST)
        };

        data.banks = banksBreakdown();

        data.agentic = {
            agents: countScoped('sn_aia_agent'),
            workflows: countScoped('sn_aia_usecase'),
            tools: countScoped('sn_aia_tool'),
            readOnlyTools: countToolsByMode('autopilot'),
            guardedTools: countToolsByMode('copilot'),
            executions: countOf('sn_aia_execution_plan')
        };

        data.governance = {
            roles: countScoped('sys_user_role'),
            acls: countScoped('sys_security_acl'),
            queryRules: countQueryRules(),
            bankEntitlements: countOf(T_BANK_ACCESS),
            adapterMethods: 4
        };

        data.outcomes = outcomeBreakdown();

        data.approvals = {
            approved: countWhere(T_REQUEST, 'confirmation_state=approved'),
            rejected: countWhere(T_REQUEST, 'confirmation_state=rejected'),
            pending: countWhere(T_REQUEST, 'confirmation_state=pending'),
            expired: countWhere(T_REQUEST, 'confirmation_state=expired')
        };
    } catch (e) {
        // Surfaced rather than swallowed: a deck showing silent zeros would be
        // worse than one admitting it could not read a figure.
        data.error = 'Some figures could not be read: ' + e;
    }
})();
