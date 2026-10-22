/**
 * Card Assistant — server script.
 *
 * Every action delegates to CardRequestBridge. The widget deliberately knows
 * nothing about the AI APIs, the agents, or the data tables: that keeps the
 * approval UX here and the business rules there, and it means the switch from
 * MVP tables to the Digital Banking ESB does not touch this file.
 *
 * CONVERSATION CONTINUITY
 * -----------------------
 * The agentic runtime cannot resume a conversation, so each turn is a separate
 * case AND a separate agentic run. Continuity comes from the session: turns
 * sharing a `session_id` are one conversation, and the bridge replays the
 * earlier ones to the agent as context. "New conversation" just mints a new
 * session id — the cases themselves are never deleted, because they are the
 * audit trail.
 *
 * SECURITY POSTURE
 * ----------------
 * This script re-resolves everything from the bridge on every call and never
 * trusts a client-supplied identity. A browser can post any payload it likes,
 * so the widget's own state is treated as a hint, not as authorisation:
 *
 *   - `bank_id` is never accepted from the client. The Stamp Card Request
 *     Identity business rule derives it from the caller's entitlement.
 *   - approve/reject are authorised inside the bridge (requester or admin),
 *     not by whether the button was rendered.
 *   - a case outside the caller's bank perimeter is simply not found.
 */
(function () {
    var T_REQUEST = 'x_snc_card_manag_1_request';

    // ---- value-to-class maps -------------------------------------------
    // Declared HERE, above any execution, on purpose. `var` declarations are
    // hoisted but their assignments are not, so a map defined further down the
    // file would still be `undefined` when loadThread() runs below.
    var STATE_CLASS = {
        new: 'label-info',
        in_progress: 'label-info',
        awaiting_input: 'label-warning',
        awaiting_confirmation: 'label-warning',
        completed: 'label-success',
        refused: 'label-warning',
        failed: 'label-danger',
        cancelled: 'label-default',
    };

    var OUTCOME_CLASS = {
        success: 'text-success',
        refused: 'text-warning',
        no_action_needed: 'text-muted',
        cancelled: 'text-muted',
        failed: 'text-danger',
    };

    var CLOSED_STATES = ['completed', 'refused', 'failed', 'cancelled'];
    var WORKING_STATES = ['new', 'in_progress'];

    // ---- always initialise, so the template never binds to undefined ----
    data.title = options.title || 'Card Assistant';
    data.placeholder = options.placeholder || 'Ask about a customer, a card or its transactions…';
    data.pollIntervalMs = parseInt(options.poll_interval_ms, 10) || 2500;
    data.maxPolls = parseInt(options.max_polls, 10) || 40;
    data.historyLimit = parseInt(options.history_limit, 10) || 10;

    data.exchanges = [];        // the conversation thread, this session only
    data.current = null;        // status DTO of the turn being worked on
    data.sessionId = '';        // which conversation we are in
    data.error = '';
    data.perimeter = null;
    data.canAsk = false;

    var bridge = new CardRequestBridge();

    // =================================================================
    // Who is the caller, and may they use the assistant at all?
    // =================================================================
    try {
        var perimeter = new CardPerimeter();
        data.perimeter = perimeter.describe();
        data.canAsk = data.perimeter.full_visibility || (data.perimeter.bank_ids || []).length > 0;
    } catch (e) {
        data.error = 'Could not resolve your bank entitlement: ' + e;
        return;
    }

    if (!data.canAsk) {
        data.error =
            'You are not entitled to any bank, so the assistant has nothing it can show you. Ask an administrator for a Bank Access entitlement.';
        return;
    }

    // =================================================================
    // Session: carried by the client, resumed on load, reset on demand
    // =================================================================
    data.sessionId = (input && input.session_id) || '';

    var action = input && input.action;

    if (action === 'new_session') {
        // Only the thread the agent can see is discarded. The cases survive.
        var fresh = bridge.newSession();
        data.sessionId = fresh.success ? fresh.data.session_id : '';
        data.current = null;
        data.lastDecision = null;
        loadThread();
        return;
    }

    if (!data.sessionId) {
        // First load: rejoin the most recent conversation rather than opening
        // a new one, so a page refresh does not look like amnesia.
        data.sessionId = mostRecentSessionId();
    }

    // =================================================================
    // Actions
    // =================================================================
    if (action === 'ask') {
        handleAsk(input);
    } else if (action === 'answer') {
        handleAnswer(input);
    } else if (action === 'poll') {
        handlePoll(input);
    } else if (action === 'approve') {
        handleDecision(input, 'approve');
    } else if (action === 'reject') {
        handleDecision(input, 'reject');
    }

    loadThread();

    // =================================================================
    // Handlers
    // =================================================================

    function handleAsk(req) {
        var message = (req.message || '') + '';
        if (!message.trim()) {
            data.error = 'Type a message first.';
            return;
        }

        var result = bridge.ask(message.trim(), 'service_portal', data.sessionId);
        if (!result.success) {
            data.error = result.message;
            return;
        }
        adoptTurn(result);
    }

    /**
     * Answers the agent's question. The bridge records the answer on the
     * waiting turn and opens the next one in the same session.
     */
    function handleAnswer(req) {
        if (!req.sys_id) {
            data.error = 'No question was identified.';
            return;
        }
        var text = (req.answer || '') + '';
        if (!text.trim()) {
            data.error = 'An answer is required.';
            return;
        }

        var result = bridge.answer(req.sys_id, text.trim());
        if (!result.success) {
            data.error = result.message;
            return;
        }
        adoptTurn(result);
    }

    function handlePoll(req) {
        if (!req.sys_id) {
            return;
        }
        var result = bridge.syncStatus(req.sys_id);
        data.current = result.success ? result.data : bridge.getStatus(req.sys_id).data;
        if (!result.success && result.message) {
            data.error = result.message;
        }
    }

    function handleDecision(req, decision) {
        if (!req.sys_id) {
            data.error = 'No request was identified for the decision.';
            return;
        }

        var result =
            decision === 'approve'
                ? bridge.approve(req.sys_id)
                : bridge.reject(req.sys_id, req.reason || '');

        // A refusal is a legitimate business outcome, not a widget error: the
        // case carries it in its outcome and the thread will render it.
        var status = bridge.getStatus(req.sys_id);
        data.current = status.success ? status.data : null;

        if (!result.success && !data.current) {
            data.error = result.message;
        }
        data.lastDecision = {
            decision: decision,
            success: result.success,
            message: result.message,
        };
    }

    /** Points `current` at the turn the bridge just created. */
    function adoptTurn(result) {
        if (!result.data || !result.data.number) {
            return;
        }
        var gr = new GlideRecord(T_REQUEST);
        gr.addQuery('number', result.data.number);
        gr.setLimit(1);
        gr.query();
        if (gr.next()) {
            data.sessionId = gr.getValue('session_id') || data.sessionId;
            data.current = bridge.getStatus(gr.getUniqueValue()).data;
        }
    }

    // =================================================================
    // Thread
    // =================================================================

    /** The session the operator was last working in. */
    function mostRecentSessionId() {
        var gr = new GlideRecord(T_REQUEST);
        gr.addQuery('requested_by', gs.getUserID());
        gr.addQuery('session_id', '!=', '');
        gr.orderByDesc('opened_at');
        gr.setLimit(1);
        gr.query();
        return gr.next() ? gr.getValue('session_id') : '';
    }

    /**
     * Rebuilds the thread from the turns of THIS session only.
     *
     * Scoped to the session, not to the user's whole history, so "New
     * conversation" visibly clears the panel. Scoped to requested_by as well,
     * because an operator should see their own exchange and not a colleague's.
     * The bank perimeter still applies underneath via the query business rule.
     */
    function loadThread() {
        data.exchanges = [];

        if (!data.sessionId) {
            return;
        }

        var gr = new GlideRecord(T_REQUEST);
        gr.addQuery('session_id', data.sessionId);
        gr.addQuery('requested_by', gs.getUserID());
        gr.orderByDesc('opened_at');
        gr.setLimit(data.historyLimit);
        gr.query();

        var rows = [];
        while (gr.next()) {
            rows.push(toExchange(gr));
        }
        // oldest first, so the newest turn sits at the bottom of the panel
        data.exchanges = rows.reverse();

        // Resume on the newest turn that still needs something.
        if (!data.current && data.exchanges.length) {
            var newest = data.exchanges[data.exchanges.length - 1];
            if (!newest.is_closed) {
                data.current = bridge.getStatus(newest.sys_id).data;
            }
        }
    }

    function toExchange(gr) {
        var confirmation = gr.getValue('confirmation_state');
        var state = gr.getValue('state');

        return {
            sys_id: gr.getUniqueValue(),
            number: gr.getValue('number'),
            message: gr.getValue('message'),
            agent_response: gr.getValue('agent_response'),
            state: state,
            state_label: gr.getDisplayValue('state'),
            state_class: STATE_CLASS[state] || 'label-default',
            is_closed: CLOSED_STATES.indexOf(state) !== -1,
            is_working: WORKING_STATES.indexOf(state) !== -1,
            awaiting_confirmation: confirmation === 'pending',
            awaiting_answer: !!gr.getValue('pending_input'),
            outcome: gr.getValue('outcome'),
            outcome_label: gr.getDisplayValue('outcome'),
            outcome_summary: gr.getValue('outcome_summary'),
            outcome_class: OUTCOME_CLASS[gr.getValue('outcome')] || '',
            opened_display: gr.getDisplayValue('opened_at'),
            escalated: gr.getValue('escalated') === '1',
        };
    }
})();
