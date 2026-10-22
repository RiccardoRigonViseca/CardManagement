/**
 * CardRequestBridge
 *
 * The server-side contract between a Card Request case and the agentic layer.
 * The Service Portal widget talks only to this class — never to the AI APIs,
 * never to the tables.
 *
 * THE PROPOSE / APPROVE SPLIT, AND WHY
 * ------------------------------------
 * In the Otto panel, a `copilot` tool's confirmation prompt is rendered by the
 * framework. A custom widget does not get that for free, and resuming a
 * conversation mid-tool-call depends on runtime internals that are not a
 * contract. So the flow is split in two, with a clean seam:
 *
 *   1. the agent UNDERSTANDS the request and parks a structured proposal on
 *      the case (proposeOperation) — that is the part only an LLM can do;
 *   2. the user approves, and the bridge EXECUTES that exact stored payload
 *      through CardOperations (approve) — deterministic, no model involved.
 *
 * The security property this buys is worth the extra step: what gets executed
 * is byte-for-byte what the user was shown and approved. It is not re-derived
 * from the conversation, so a model that changed its mind between proposal and
 * approval cannot alter the action. And because CardOperations still validates
 * everything, an approved-but-invalid action is refused anyway.
 *
 * IDENTITY
 * --------
 * The conversation is started with `conversationUser` set to the case's
 * requester. The platform then evaluates the workflow ACL against that user
 * (hasUsecaseAclAccess) and the agents run under their identity, so the
 * bank_id perimeter applies with no extra plumbing. The bridge never elevates.
 *
 * Every method returns { success, message, data } — the same shape as
 * CardOperations, so the widget has one response contract to handle.
 */
var CardRequestBridge = Class.create()

CardRequestBridge.prototype = {
    initialize: function () {
        this.T_REQUEST = 'x_snc_card_manag_1_request'
        this.T_PLAN = 'sn_aia_execution_plan'
        this.T_MESSAGE = 'sn_aia_message'

        this.PROP_WORKFLOW = 'x_snc_card_manag_1.servicing_workflow_id'
        this.PROP_TIMEOUT = 'x_snc_card_manag_1.approval_timeout_minutes'
        this.PROP_HISTORY_TURNS = 'x_snc_card_manag_1.history_turns'

        this.perimeter = new CardPerimeter()

        /**
         * Proposed action -> how to execute it.
         *
         * `target` names the case field holding the business key the operation
         * applies to, so approve() never has to guess what the payload is for.
         */
        this.ACTIONS = {
            block_card: { target: 'card_id', method: 'blockCard' },
            unblock_card: { target: 'card_id', method: 'unblockCard' },
            update_limits: { target: 'card_id', method: 'updateCardLimits' },
            update_controls: { target: 'card_id', method: 'updateCardControls' },
            update_contact: { target: 'customer_id', method: 'updateCustomer' },
            dispute_transaction: { target: 'transaction_id', method: 'disputeTransaction' },
        }
    },

    // =====================================================================
    // Result helpers
    // =====================================================================

    _ok: function (message, data) {
        return { success: true, message: message, data: data || null }
    },

    _fail: function (message, data) {
        return { success: false, message: message, data: data || null }
    },

    _log: function (action, requestNumber, detail) {
        gs.info(
            '[CardRequestBridge] ' + action + ' request=' + requestNumber + ' by=' + gs.getUserName() +
                (detail ? ' | ' + detail : ''),
        )
    },

    _note: function (gr, text) {
        gr.setValue('work_notes', text)
    },

    // =====================================================================
    // Record access
    // =====================================================================

    /**
     * Loads a case by sys_id. The query business rule on the table applies the
     * bank perimeter, so a case belonging to another bank simply is not found
     * — the caller cannot tell it exists, which is the behaviour we want.
     */
    _load: function (requestSysId) {
        if (!requestSysId) {
            return { error: this._fail('A request sys_id is required.') }
        }
        var gr = new GlideRecord(this.T_REQUEST)
        if (!gr.get(requestSysId)) {
            return { error: this._fail('Card request not found, or outside your bank scope.') }
        }
        return { record: gr }
    },

    _loadByNumber: function (requestNumber) {
        if (!requestNumber) {
            return { error: this._fail('A request number is required.') }
        }
        var gr = new GlideRecord(this.T_REQUEST)
        gr.addQuery('number', '' + requestNumber)
        gr.setLimit(1)
        gr.query()
        if (!gr.next()) {
            return { error: this._fail('Card request ' + requestNumber + ' not found, or outside your bank scope.') }
        }
        return { record: gr }
    },

    // =====================================================================
    // 1. SUBMIT — hand the case to the workflow
    // =====================================================================

    /**
     * Starts the Card Servicing Workflow for a case.
     *
     * @param requestSysId sys_id of the Card Request
     * @return { success, message, data: { number, state, conversation_id, execution_plan_id } }
     */
    submit: function (requestSysId) {
        var res = this._load(requestSysId)
        if (res.error) {
            return res.error
        }
        var request = res.record
        var number = request.getValue('number')

        // --- guards: never submit the same case twice ------------------
        var state = request.getValue('state')
        if (state !== 'new') {
            return this._fail(
                'Request ' + number + ' is in state "' + state + '" and has already been submitted.',
                { number: number, state: state },
            )
        }
        if (request.getValue('execution_plan_id')) {
            return this._fail('Request ' + number + ' already has an execution plan.', { number: number })
        }

        var objective = request.getValue('message')
        if (!objective) {
            return this._fail('Request ' + number + ' has no message to send.')
        }

        var workflowId = gs.getProperty(this.PROP_WORKFLOW, '')
        if (!workflowId) {
            return this._fail(
                'No servicing workflow is configured. Set the property ' + this.PROP_WORKFLOW + '.',
            )
        }

        // --- start the conversation AS THE REQUESTER -------------------
        // The platform checks the workflow ACL for this user and runs the
        // agents under their identity, so the bank perimeter applies.
        var payload = {
            usecaseId: workflowId,
            objective: objective,
            conversationUser: request.getValue('requested_by'),
            targetRecordId: request.getUniqueValue(),
            targetTable: this.T_REQUEST,
            conversationLabel: 'Card Request ' + number,
        }

        // --- carry the conversation so far -----------------------------
        // Each turn is its own case and its own agentic conversation, because
        // the runtime exposes no way to resume one (AiAgentRuntimeUtil offers
        // only startAiAgentConversation). Without this, every question would
        // start from nothing and the operator would have to repeat context
        // they already gave.
        //
        // So the prior turns of the same session are replayed as
        // contextMemory. The agent is not literally continuing the previous
        // conversation, but it can see what was asked and answered.
        //
        // The case NUMBER goes in here too, deliberately. The platform puts
        // only the record's sys_id into the trigger context, but the Propose
        // Card Operation tool is keyed by number — without it the agent cannot
        // route a write through the approval gate and falls back to asking in
        // prose instead.
        var memory = {
            card_request_number: number,
            instruction:
                'This conversation is card request ' + number +
                '. For any operation that changes data, call Propose Card Operation with request_number "' + number +
                '" so the operator can approve it in the portal. Do not ask for confirmation in prose.',
        }

        var history = this._buildSessionHistory(request)
        if (history.length) {
            memory.conversation_so_far = history
            memory.history_note =
                'Earlier turns of this same conversation with the same operator. Use them to resolve references such as "that card", "the same customer" or "yes".'
        }

        payload.contextMemory = JSON.stringify(memory)

        var response
        try {
            response = new sn_aia.AiAgentRuntimeUtil().startAiAgentConversation(payload)
        } catch (e) {
            request.setValue('state', 'failed')
            request.setValue('outcome', 'failed')
            request.setValue('outcome_summary', 'Could not start the servicing workflow: ' + e)
            this._note(request, 'Failed to start the agentic workflow: ' + e)
            request.update()
            this._log('SUBMIT-ERROR', number, '' + e)
            return this._fail('Could not start the servicing workflow: ' + e, { number: number })
        }

        // A nil response means the runtime refused before starting — most
        // often licensing, or the requester failing the workflow ACL.
        if (!response) {
            request.setValue('state', 'failed')
            request.setValue('outcome', 'failed')
            request.setValue(
                'outcome_summary',
                'The agentic runtime did not start a conversation. The requester may not be allowed to invoke the workflow, or the AI subscription is unavailable.',
            )
            this._note(request, 'Agentic runtime returned no response when starting the conversation.')
            request.update()
            this._log('SUBMIT-REFUSED', number, 'nil response')
            return this._fail(
                'The servicing workflow did not start. Check that the requester may invoke it and that the AI subscription is active.',
                { number: number },
            )
        }

        var ids = this._extractIds(response)

        if (!ids.executionPlanId && !ids.conversationId) {
            request.setValue('state', 'failed')
            request.setValue('outcome', 'failed')
            request.setValue('outcome_summary', 'The agentic runtime returned no execution identifiers.')
            request.setValue('outcome_detail', JSON.stringify({ raw_response: response }))
            this._note(request, 'Agentic runtime response carried no execution plan or conversation id.')
            request.update()
            this._log('SUBMIT-NOIDS', number, JSON.stringify(response))
            return this._fail('The servicing workflow did not return an execution reference.', {
                number: number,
                raw_response: response,
            })
        }

        request.setValue('state', 'in_progress')
        if (ids.conversationId) {
            request.setValue('conversation_id', ids.conversationId)
        }
        if (ids.executionPlanId) {
            request.setValue('execution_plan_id', ids.executionPlanId)
        }
        this._note(request, 'Submitted to the Card Servicing Workflow.')
        request.update()

        this._log('SUBMIT', number, 'plan=' + ids.executionPlanId + ' conv=' + ids.conversationId)

        return this._ok('Request ' + number + ' submitted to the servicing workflow.', {
            number: number,
            state: 'in_progress',
            conversation_id: ids.conversationId,
            execution_plan_id: ids.executionPlanId,
        })
    },

    /**
     * Pulls the conversation and plan ids out of the runtime response.
     *
     * The response shape is built by the platform's response handler and is
     * not a documented contract, so several key spellings are probed rather
     * than assuming one. Whatever is found is recorded; what is missing is
     * reported rather than silently treated as success.
     */
    _extractIds: function (response) {
        var out = { conversationId: '', executionPlanId: '' }

        var convKeys = ['conversationId', 'conversation_id', 'conversation']
        var planKeys = ['executionPlanId', 'execution_plan_id', 'executionPlan', 'planId']

        var roots = [response]
        if (response && typeof response === 'object') {
            if (response.data) {
                roots.push(response.data)
            }
            if (response.result) {
                roots.push(response.result)
            }
            if (response.payload) {
                roots.push(response.payload)
            }
        }

        roots.forEach(function (root) {
            if (!root || typeof root !== 'object') {
                return
            }
            convKeys.forEach(function (k) {
                if (!out.conversationId && root[k]) {
                    out.conversationId = '' + root[k]
                }
            })
            planKeys.forEach(function (k) {
                if (!out.executionPlanId && root[k]) {
                    out.executionPlanId = '' + root[k]
                }
            })
        })

        return out
    },

    // =====================================================================
    // 2. SYNC — reflect the agentic execution onto the case
    // =====================================================================

    /**
     * Reads the execution plan and the agent's messages, and updates the case.
     *
     * Called by the widget while polling. Safe to call repeatedly: it never
     * moves a case that is already closed, and never overwrites a pending
     * approval with a plan state.
     */
    syncStatus: function (requestSysId) {
        var res = this._load(requestSysId)
        if (res.error) {
            return res.error
        }
        var request = res.record
        var number = request.getValue('number')
        var planId = request.getValue('execution_plan_id')

        if (!planId) {
            return this._ok('Request ' + number + ' has not been submitted yet.', this._statusDTO(request))
        }

        // Closed cases are terminal — nothing the plan says can reopen them.
        var caseState = request.getValue('state')
        if (['completed', 'refused', 'failed', 'cancelled'].indexOf(caseState) !== -1) {
            return this._ok('Request ' + number + ' is already closed.', this._statusDTO(request))
        }

        var plan = new GlideRecord(this.T_PLAN)
        if (!plan.get(planId)) {
            return this._fail('Execution plan ' + planId + ' not found.', this._statusDTO(request))
        }

        var planState = plan.getValue('state')
        var planStatus = plan.getValue('status')
        var stateReason = plan.getValue('state_reason')

        // --- bring across the agent's reply ---------------------------
        var reply = this._collectAgentMessages(planId)
        if (reply.text) {
            request.setValue('agent_response', reply.text.substring(0, 8000))
        }

        var changed = false

        // An approval parked by the agent outranks the plan state: the case is
        // waiting on a human, not on the runtime.
        if (request.getValue('confirmation_state') === 'pending') {
            if (this._expireIfStale(request)) {
                changed = true
            } else if (request.getValue('state') !== 'awaiting_confirmation') {
                request.setValue('state', 'awaiting_confirmation')
                changed = true
            }
        } else if (reply.inputRequests.length) {
            // The agent asked the operator something. Also a human wait, so it
            // outranks the plan state the same way an approval does.
            request.setValue('pending_input', JSON.stringify(reply.inputRequests))
            request.setValue('state', 'awaiting_input')
            changed = true
        } else if (planState === 'completed' || planState === 'wrap_up') {
            // No proposal was parked, so this was an informational request.
            request.setValue('state', 'completed')
            if (!request.getValue('outcome')) {
                request.setValue('outcome', planStatus === 'error' ? 'failed' : 'no_action_needed')
            }
            if (!request.getValue('outcome_summary')) {
                request.setValue(
                    'outcome_summary',
                    planStatus === 'error'
                        ? 'The agentic workflow ended with an error.'
                        : 'Answered by the servicing workflow; no change was required.',
                )
            }
            changed = true
        } else if (['terminated', 'abandoned', 'deleted'].indexOf(planState) !== -1) {
            request.setValue('state', 'failed')
            request.setValue('outcome', 'failed')
            request.setValue(
                'outcome_summary',
                'The agentic workflow ended as "' + planState + '"' +
                    (stateReason ? ' (' + stateReason + ')' : '') + '.',
            )
            this._note(request, 'Workflow ended without completing: ' + planState + ' / ' + stateReason)
            changed = true
        }

        if (reply.errors.length) {
            this._note(request, 'Agent reported: ' + reply.errors.join(' | '))
            changed = true
        }

        if (changed || reply.text) {
            request.update()
        }

        var dto = this._statusDTO(request)
        dto.plan_state = planState
        dto.plan_status = planStatus
        return this._ok('Status synchronised.', dto)
    },

    /**
     * Collects what the agent actually said TO THE USER, oldest first.
     *
     * WHY THE FILTER MATTERS
     * ----------------------
     * An execution plan records everything the runtime did, not just the
     * answer: raw tool output as JSON, the Orchestrator's internal task
     * assignments, empty `{}` handshakes, and the Manager's bootstrap payload.
     * Concatenating all of it is how the widget ended up showing the whole
     * machine transcript instead of a reply.
     *
     * The discriminator is `user_message`: internal records populate only
     * `message`, while anything meant for a human populates `user_message`
     * too. Note that `user_message` cannot be used in an encoded query on this
     * table — `user_messageISNOTEMPTY` matches nothing — so the filter has to
     * run in script after reading each row.
     *
     * STRUCTURED INPUT REQUESTS
     * -------------------------
     * When an agent needs an answer it emits a JSON array of
     * `{name, prompt}` objects rather than prose. Those are separated out as
     * `inputRequests` so the widget can render real buttons instead of
     * dumping JSON on screen.
     */
    _collectAgentMessages: function (planId) {
        var parts = []
        var errors = []
        var inputRequests = []

        var gr = new GlideRecord(this.T_MESSAGE)
        gr.addQuery('execution_plan', planId)
        gr.addQuery('role', 'agent')
        gr.query()

        while (gr.next()) {
            // Read, then filter in script: see the note above.
            var userText = '' + (gr.getValue('user_message') || '')
            if (!userText.trim()) {
                continue
            }

            if (gr.getValue('type') === 'error') {
                errors.push(userText)
                continue
            }

            var structured = this._parseInputRequests(userText)
            if (structured.length) {
                structured.forEach(function (req) {
                    inputRequests.push(req)
                })
                continue
            }

            parts.push({
                text: userText,
                author: gr.getValue('name') || '',
                at: gr.getValue('sys_created_on'),
            })
        }

        // The platform's own ordering counter is unreliable on these rows
        // (some arrive with it empty), so order by creation time instead.
        parts.sort(function (a, b) {
            return ('' + a.at).localeCompare('' + b.at)
        })

        return {
            text: parts
                .map(function (p) {
                    return p.text
                })
                .join('\n\n'),
            errors: errors,
            inputRequests: inputRequests,
        }
    },

    /**
     * Recognises a structured input request and normalises it.
     *
     * Returns [] for ordinary prose, so a normal answer is never mistaken for
     * a question. Yes/no intent is inferred from the request name and prompt
     * so the widget can offer two buttons instead of a free-text box.
     */
    _parseInputRequests: function (text) {
        var trimmed = ('' + text).trim()
        if (trimmed.charAt(0) !== '[' && trimmed.charAt(0) !== '{') {
            return []
        }

        var parsed
        try {
            parsed = JSON.parse(trimmed)
        } catch (e) {
            return []
        }

        var list = Array.isArray(parsed) ? parsed : [parsed]
        var out = []

        for (var i = 0; i < list.length; i++) {
            var item = list[i]
            if (!item || typeof item !== 'object' || !item.prompt) {
                return [] // not an input request after all
            }
            var name = '' + (item.name || 'answer')
            var prompt = '' + item.prompt
            out.push({
                name: name,
                prompt: prompt,
                is_confirmation: this._looksLikeConfirmation(name, prompt),
            })
        }

        return out
    },

    _looksLikeConfirmation: function (name, prompt) {
        var haystack = (name + ' ' + prompt).toLowerCase()
        var signals = ['confirm', 'proceed', 'do you want', 'shall i', 'approve', 'yes or no', 'y/n']
        for (var i = 0; i < signals.length; i++) {
            if (haystack.indexOf(signals[i]) !== -1) {
                return true
            }
        }
        return false
    },

    /**
     * The prior turns of this case's session, oldest first.
     *
     * Only what a human said and what the agent answered — never the internal
     * transcript, which would flood the model's context with its own tool
     * output. Capped, because contextMemory is a bounded field and an
     * unbounded history would eventually be truncated mid-JSON.
     */
    _buildSessionHistory: function (request) {
        var sessionId = request.getValue('session_id')
        if (!sessionId) {
            return []
        }

        var maxTurns = parseInt(gs.getProperty(this.PROP_HISTORY_TURNS, '6'), 10)
        if (isNaN(maxTurns) || maxTurns <= 0) {
            maxTurns = 6
        }

        var turns = []
        var gr = new GlideRecord(this.T_REQUEST)
        gr.addQuery('session_id', sessionId)
        gr.addQuery('sys_id', '!=', request.getUniqueValue())
        gr.orderByDesc('opened_at')
        gr.setLimit(maxTurns)
        gr.query()

        while (gr.next()) {
            var turn = {
                asked: gr.getValue('message'),
            }
            var answered = gr.getValue('agent_response')
            if (answered) {
                turn.answered = ('' + answered).substring(0, 1500)
            }
            var outcome = gr.getValue('outcome_summary')
            if (outcome) {
                turn.outcome = ('' + outcome).substring(0, 400)
            }
            turns.push(turn)
        }

        return turns.reverse() // oldest first reads more naturally for a model
    },

    /**
     * Answers a question the agent asked, as the next turn of the same
     * session.
     *
     * The answer is not injected into the paused conversation — the runtime
     * has no resume entry point — so it becomes a new turn that carries the
     * history forward. From the operator's point of view it is one continuous
     * exchange.
     */
    answer: function (requestSysId, answerText) {
        var res = this._load(requestSysId)
        if (res.error) {
            return res.error
        }
        var request = res.record
        var number = request.getValue('number')

        if (!answerText || !('' + answerText).trim()) {
            return this._fail('An answer is required.')
        }

        var pending = request.getValue('pending_input')
        if (!pending) {
            return this._fail('Request ' + number + ' is not waiting for an answer.')
        }

        // Close this turn as answered, so it stops looking open.
        request.setValue('pending_input', '')
        request.setValue('state', 'completed')
        if (!request.getValue('outcome')) {
            request.setValue('outcome', 'no_action_needed')
            request.setValue('outcome_summary', 'The operator answered the question; the exchange continues.')
        }
        this._note(request, 'Operator answered: ' + answerText)
        request.update()

        this._log('ANSWER', number, '' + answerText)

        // Continue as a new turn in the same session.
        return this.ask(answerText, request.getValue('channel'), request.getValue('session_id'))
    },

    /**
     * Starts a fresh session, discarding the conversational context.
     *
     * The cases themselves are never deleted — they are the audit trail. What
     * is dropped is only the thread the agent gets to see, which is what
     * "clear the memory" means here.
     */
    newSession: function () {
        var sessionId = gs.generateGUID().substring(0, 32)
        this._log('NEW-SESSION', '-', sessionId)
        return this._ok('Started a new conversation.', { session_id: sessionId })
    },

    // =====================================================================
    // 3. PROPOSE — the agent parks its intent (called by the agent tool)
    // =====================================================================

    /**
     * Records the operation the agent wants to perform, for the user to
     * approve. Nothing is executed here.
     *
     * @param requestNumber case number, e.g. "CRQ0001001"
     * @param action        one of the ACTIONS keys
     * @param summary       plain-language description shown to the user
     * @param payload       JSON string, or object, of arguments for CardOperations
     */
    proposeOperation: function (requestNumber, action, summary, payload) {
        var res = this._loadByNumber(requestNumber)
        if (res.error) {
            return res.error
        }
        var request = res.record
        var number = request.getValue('number')

        if (!action || !this.ACTIONS.hasOwnProperty(action)) {
            return this._fail(
                'Unknown action "' + action + '". Valid actions: ' + Object.keys(this.ACTIONS).join(', '),
            )
        }
        if (!summary) {
            return this._fail('A plain-language summary is required so the user knows what they are approving.')
        }

        var state = request.getValue('state')
        if (['completed', 'refused', 'failed', 'cancelled'].indexOf(state) !== -1) {
            return this._fail('Request ' + number + ' is already closed (' + state + ').')
        }
        if (request.getValue('confirmation_state') === 'pending') {
            return this._fail('Request ' + number + ' already has a proposal awaiting confirmation.')
        }

        // --- payload must be structured and non-empty -----------------
        var parsed
        try {
            parsed = typeof payload === 'string' ? JSON.parse(payload) : payload
        } catch (e) {
            return this._fail('The payload is not valid JSON: ' + e)
        }
        if (!parsed || typeof parsed !== 'object') {
            return this._fail('The payload must be a JSON object of arguments for the operation.')
        }

        // --- the target business key must be present ------------------
        var spec = this.ACTIONS[action]
        var targetField = spec.target
        var targetValue = parsed[targetField] || request.getValue(targetField)
        if (!targetValue) {
            return this._fail(
                'The proposal is missing "' + targetField + '", so there is no way to tell what it applies to.',
            )
        }

        request.setValue(targetField, targetValue)
        request.setValue('proposed_action', action)
        request.setValue('proposed_action_summary', '' + summary)
        request.setValue('proposed_action_payload', JSON.stringify(parsed))
        request.setValue('proposed_at', new GlideDateTime().getValue())
        request.setValue('confirmation_state', 'pending')
        request.setValue('state', 'awaiting_confirmation')
        if (!request.getValue('request_type')) {
            request.setValue('request_type', this._requestTypeFor(action))
        }
        this._note(request, 'Agent proposed: ' + summary)
        request.update()

        this._log('PROPOSE', number, action + ' -> ' + targetField + '=' + targetValue)

        return this._ok(
            'Proposal recorded on request ' + number + '. It is now awaiting user confirmation.',
            {
                number: number,
                proposed_action: action,
                target: targetValue,
                confirmation_state: 'pending',
            },
        )
    },

    _requestTypeFor: function (action) {
        var map = {
            block_card: 'card_block',
            unblock_card: 'card_unblock',
            update_limits: 'limit_change',
            update_controls: 'control_change',
            update_contact: 'contact_update',
            dispute_transaction: 'transaction_dispute',
        }
        return map[action] || 'other'
    },

    // =====================================================================
    // 4. APPROVE / REJECT — the human gate
    // =====================================================================

    /**
     * Executes the proposal the user approved.
     *
     * Only the requester, or an administrator, may approve. Without that check
     * any operator sharing the bank could approve someone else's card block,
     * which would make the whole approval gate decorative.
     */
    approve: function (requestSysId) {
        var res = this._load(requestSysId)
        if (res.error) {
            return res.error
        }
        var request = res.record
        var number = request.getValue('number')

        if (request.getValue('confirmation_state') !== 'pending') {
            return this._fail(
                'Request ' + number + ' has no proposal awaiting confirmation (current: ' +
                    request.getValue('confirmation_state') + ').',
            )
        }

        var approvalCheck = this._assertMayDecide(request)
        if (approvalCheck) {
            return approvalCheck
        }

        if (this._expireIfStale(request)) {
            request.update()
            this._log('APPROVE-EXPIRED', number, '')
            return this._fail(
                'The proposal on request ' + number + ' expired before it was approved. Ask the agent again so it can re-check the card.',
                this._statusDTO(request),
            )
        }

        var action = request.getValue('proposed_action')
        var spec = this.ACTIONS[action]
        if (!spec) {
            return this._fail('Request ' + number + ' carries an unknown proposed action "' + action + '".')
        }

        var args
        try {
            args = JSON.parse('' + request.getValue('proposed_action_payload'))
        } catch (e) {
            return this._fail('The stored proposal payload is not readable: ' + e)
        }

        // --- record the decision before acting ------------------------
        request.setValue('confirmation_state', 'approved')
        request.setValue('confirmed_by', gs.getUserID())
        request.setValue('confirmed_at', new GlideDateTime().getValue())
        request.setValue('state', 'in_progress')
        this._note(request, 'Approved by ' + gs.getUserName() + '. Executing: ' + request.getValue('proposed_action_summary'))
        request.update()

        // --- execute the EXACT approved payload -----------------------
        var result = this._execute(action, spec, args, request)

        // --- reflect the outcome onto the case ------------------------
        request.setValue('outcome_detail', JSON.stringify(result))
        request.setValue('outcome_summary', ('' + result.message).substring(0, 2000))

        if (result.success) {
            request.setValue('state', 'completed')
            request.setValue('outcome', 'success')
        } else {
            // A refusal is the business rules working, not a system failure —
            // which is exactly why outcome is a separate field from state.
            request.setValue('state', 'refused')
            request.setValue('outcome', 'refused')
        }
        this._note(request, (result.success ? 'Executed: ' : 'Refused: ') + result.message)
        request.update()

        this._log('APPROVE', number, action + ' success=' + result.success)

        return result.success
            ? this._ok(result.message, this._statusDTO(request))
            : this._fail(result.message, this._statusDTO(request))
    },

    /**
     * Records a rejection. The proposed operation is never executed.
     */
    reject: function (requestSysId, reason) {
        var res = this._load(requestSysId)
        if (res.error) {
            return res.error
        }
        var request = res.record
        var number = request.getValue('number')

        if (request.getValue('confirmation_state') !== 'pending') {
            return this._fail(
                'Request ' + number + ' has no proposal awaiting confirmation (current: ' +
                    request.getValue('confirmation_state') + ').',
            )
        }

        var approvalCheck = this._assertMayDecide(request)
        if (approvalCheck) {
            return approvalCheck
        }

        request.setValue('confirmation_state', 'rejected')
        request.setValue('confirmed_by', gs.getUserID())
        request.setValue('confirmed_at', new GlideDateTime().getValue())
        if (reason) {
            request.setValue('rejection_reason', ('' + reason).substring(0, 255))
        }
        request.setValue('state', 'cancelled')
        request.setValue('outcome', 'cancelled')
        request.setValue(
            'outcome_summary',
            'The proposed operation was rejected by the user' + (reason ? ': ' + reason : '') + '.',
        )
        this._note(request, 'Rejected by ' + gs.getUserName() + (reason ? ': ' + reason : ''))
        request.update()

        this._log('REJECT', number, '' + (reason || ''))

        return this._ok('Request ' + number + ' was rejected and no change was made.', this._statusDTO(request))
    },

    /**
     * Only the requester or an administrator may decide on a proposal.
     * Returns a failure result when the caller may not, or null when they may.
     */
    _assertMayDecide: function (request) {
        var isRequester = request.getValue('requested_by') === gs.getUserID()
        var isAdmin = this.perimeter.hasFullVisibility()
        if (isRequester || isAdmin) {
            return null
        }
        return this._fail(
            'Only the user who opened request ' + request.getValue('number') +
                ' can approve or reject the proposed operation.',
        )
    },

    /**
     * Expires a pending proposal that has gone stale. Mutates the record but
     * does not save it — callers decide when to write.
     *
     * @return boolean true when the proposal was expired
     */
    _expireIfStale: function (request) {
        var proposedAt = request.getValue('proposed_at')
        if (!proposedAt) {
            return false
        }

        var minutes = parseInt(gs.getProperty(this.PROP_TIMEOUT, '30'), 10)
        if (isNaN(minutes) || minutes <= 0) {
            return false
        }

        var proposed = new GlideDateTime(proposedAt)
        var ageSeconds = Math.round((new GlideDateTime().getNumericValue() - proposed.getNumericValue()) / 1000)
        if (ageSeconds <= minutes * 60) {
            return false
        }

        request.setValue('confirmation_state', 'expired')
        request.setValue('state', 'cancelled')
        request.setValue('outcome', 'cancelled')
        request.setValue(
            'outcome_summary',
            'The proposed operation expired after ' + minutes + ' minutes without confirmation.',
        )
        this._note(
            request,
            'Proposal expired after ' + minutes + ' minutes. The card state may have changed since it was proposed.',
        )
        return true
    },

    /**
     * Dispatches the approved payload to CardOperations.
     *
     * CardOperations re-validates everything — state transitions, the limit
     * hierarchy, the editable-field whitelist and the bank perimeter — so an
     * approved action that is nonetheless invalid is refused here rather than
     * applied. Approval is consent, not an override.
     */
    _execute: function (action, spec, args, request) {
        var ops = new CardOperations()

        try {
            switch (action) {
                case 'block_card':
                    return ops.blockCard(args.card_id || request.getValue('card_id'), {
                        type: args.type || 'temporary',
                        reason: args.reason,
                        notes: args.notes,
                    })

                case 'unblock_card':
                    return ops.unblockCard(args.card_id || request.getValue('card_id'), {
                        reason: args.reason,
                        notes: args.notes,
                    })

                case 'update_limits':
                    return ops.updateCardLimits(
                        args.card_id || request.getValue('card_id'),
                        args.limits || this._without(args, ['card_id']),
                    )

                case 'update_controls':
                    return ops.updateCardControls(
                        args.card_id || request.getValue('card_id'),
                        args.controls || this._without(args, ['card_id']),
                    )

                case 'update_contact':
                    return ops.updateCustomer(
                        args.customer_id || request.getValue('customer_id'),
                        args.data || this._without(args, ['customer_id']),
                    )

                case 'dispute_transaction':
                    return ops.disputeTransaction(
                        args.transaction_id || request.getValue('transaction_id'),
                        args.reason,
                    )

                default:
                    return this._fail('No executor is defined for action "' + action + '".')
            }
        } catch (e) {
            gs.error('[CardRequestBridge] execution of ' + action + ' threw: ' + e)
            return this._fail('The operation failed while executing: ' + e)
        }
    },

    /** Shallow copy of an object minus the listed keys. */
    _without: function (obj, keys) {
        var out = {}
        for (var k in obj) {
            if (obj.hasOwnProperty(k) && keys.indexOf(k) === -1) {
                out[k] = obj[k]
            }
        }
        return out
    },

    // =====================================================================
    // 5. ESCALATE — hand the case to a human
    // =====================================================================

    escalate: function (requestSysId, reason, assignTo) {
        var res = this._load(requestSysId)
        if (res.error) {
            return res.error
        }
        var request = res.record
        var number = request.getValue('number')

        request.setValue('escalated', true)
        if (reason) {
            request.setValue('escalation_reason', ('' + reason).substring(0, 255))
        }
        if (assignTo) {
            request.setValue('escalated_to', assignTo)
        }
        if (request.getValue('confirmation_state') === 'pending') {
            request.setValue('confirmation_state', 'expired')
        }
        this._note(request, 'Escalated to a human operator' + (reason ? ': ' + reason : ''))
        request.update()

        this._log('ESCALATE', number, '' + (reason || ''))

        return this._ok('Request ' + number + ' was escalated to a human operator.', this._statusDTO(request))
    },

    // =====================================================================
    // 6. STATUS — what the widget polls
    // =====================================================================

    getStatus: function (requestSysId) {
        var res = this._load(requestSysId)
        if (res.error) {
            return res.error
        }
        return this._ok('Status retrieved.', this._statusDTO(res.record))
    },

    /**
     * The widget's view of a case. Includes `can_decide` so the UI can render
     * the approve and reject buttons without having to re-derive the rule.
     */
    _statusDTO: function (request) {
        var payload = null
        var raw = request.getValue('proposed_action_payload')
        if (raw) {
            try {
                payload = JSON.parse('' + raw)
            } catch (e) {
                payload = null
            }
        }

        var confirmation = request.getValue('confirmation_state')

        // The question the agent is waiting on, if any.
        var pendingInput = null
        var rawPending = request.getValue('pending_input')
        if (rawPending) {
            try {
                pendingInput = JSON.parse('' + rawPending)
            } catch (e) {
                pendingInput = null
            }
        }

        return {
            sys_id: request.getUniqueValue(),
            number: request.getValue('number'),
            session_id: request.getValue('session_id'),
            state: request.getValue('state'),
            state_label: request.getDisplayValue('state'),
            is_closed: ['completed', 'refused', 'failed', 'cancelled'].indexOf(request.getValue('state')) !== -1,

            message: request.getValue('message'),
            agent_response: request.getValue('agent_response'),

            // What the agent is asking. `awaiting_answer` is what the widget
            // keys its question UI off, kept separate from the structured
            // approval flow so the two never collide.
            pending_input: pendingInput,
            awaiting_answer: !!(pendingInput && pendingInput.length),

            request_type: request.getValue('request_type'),
            bank_id: request.getValue('bank_id'),

            proposal: confirmation === 'pending'
                ? {
                      action: request.getValue('proposed_action'),
                      action_label: request.getDisplayValue('proposed_action'),
                      summary: request.getValue('proposed_action_summary'),
                      payload: payload,
                      proposed_at: request.getValue('proposed_at'),
                  }
                : null,

            confirmation_state: confirmation,
            awaiting_confirmation: confirmation === 'pending',
            can_decide:
                confirmation === 'pending' &&
                (request.getValue('requested_by') === gs.getUserID() || this.perimeter.hasFullVisibility()),

            outcome: request.getValue('outcome'),
            outcome_label: request.getDisplayValue('outcome'),
            outcome_summary: request.getValue('outcome_summary'),

            customer_id: request.getValue('customer_id'),
            card_id: request.getValue('card_id'),
            transaction_id: request.getValue('transaction_id'),

            escalated: request.getValue('escalated') === '1',
            opened_at: request.getValue('opened_at'),
            closed_at: request.getValue('closed_at'),
            processing_seconds: request.getValue('processing_seconds'),
        }
    },

    // =====================================================================
    // 7. ASK — convenience: open a case and submit it in one call
    // =====================================================================

    /**
     * What the widget calls when the user sends a message.
     *
     * bank_id is intentionally NOT a parameter: the Stamp Card Request Identity
     * business rule resolves it from the caller's entitlement, so a widget
     * cannot open a case against a bank it is not entitled to.
     *
     * @param sessionId groups this turn with the rest of the conversation.
     *                  Omit to start a fresh one.
     */
    ask: function (message, channel, sessionId) {
        if (!message) {
            return this._fail('A message is required.')
        }

        var gr = new GlideRecord(this.T_REQUEST)
        gr.initialize()
        gr.setValue('message', '' + message)
        gr.setValue('channel', channel || 'service_portal')
        gr.setValue('session_id', sessionId || gs.generateGUID().substring(0, 32))

        var sysId = gr.insert()
        if (!sysId) {
            // The insert was aborted — almost always the entitlement guard.
            return this._fail(
                'Could not open the request. You may not be entitled to any bank, or your entitlement covers several banks and one must be chosen.',
            )
        }

        return this.submit(sysId)
    },

    type: 'CardRequestBridge',
}
