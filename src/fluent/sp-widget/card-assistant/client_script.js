/**
 * Card Assistant — client controller.
 *
 * SESSION
 * -------
 * Every server call carries `session_id`, because the server has no sticky
 * state: the session is what stitches separate turns into one conversation.
 * "New conversation" asks the server for a fresh id and the thread empties.
 *
 * POLLING, AND WHY IT IS BOUNDED
 * ------------------------------
 * The agentic run is asynchronous: the server returns as soon as the workflow
 * is launched, not when it has finished. So the widget polls.
 *
 * The polling is deliberately bounded and self-cancelling. An unbounded poll
 * against an agent that never completes would hammer the instance for as long
 * as the tab stays open, so it stops on a terminal state, on a pending
 * approval or a pending question (it is now waiting on a human, not on the
 * runtime), after a capped number of attempts, and when the widget is
 * destroyed.
 */
api.controller = function ($scope, $timeout) {
    var c = this;

    c.draft = '';
    c.sending = false;
    c.deciding = false;
    c.rejecting = false;
    c.answering = false;
    c.rejectReason = '';
    c.answerDraft = '';
    c.showRejectForm = false;
    c.polling = false;
    c.pollTimedOut = false;
    c.confirmNewConversation = false;

    var pollHandle = null;
    var pollCount = 0;

    // =================================================================
    // Every call carries the session
    // =================================================================

    function callServer() {
        c.data.session_id = c.data.sessionId || '';
        return c.server.update();
    }

    // =================================================================
    // Sending a message
    // =================================================================

    c.send = function () {
        var text = (c.draft || '').trim();
        if (!text || c.sending) {
            return;
        }

        c.sending = true;
        c.pollTimedOut = false;
        c.data.error = '';

        // c.server.update() posts the whole c.data object, so the action and
        // its arguments have to be assigned onto it first.
        c.data.action = 'ask';
        c.data.message = text;

        callServer().then(function () {
            c.sending = false;
            c.data.action = null;
            c.data.message = null;
            c.draft = '';
            startPolling();
        });
    };

    /** Enter sends, Shift+Enter inserts a newline. */
    c.onKeydown = function (event) {
        if (event.keyCode === 13 && !event.shiftKey) {
            event.preventDefault();
            c.send();
        }
    };

    // =================================================================
    // Answering the agent's question
    // =================================================================

    /**
     * Yes/No are just canned answers: the agent asked in prose, so the reply
     * travels as prose too. The buttons exist so the operator does not have to
     * guess what wording the agent will accept.
     */
    c.answerYes = function () {
        c.sendAnswer('Yes, go ahead.');
    };

    c.answerNo = function () {
        c.sendAnswer('No, do not proceed.');
    };

    c.sendAnswerDraft = function () {
        var text = (c.answerDraft || '').trim();
        if (text) {
            c.sendAnswer(text);
        }
    };

    c.sendAnswer = function (text) {
        if (!c.data.current || c.answering) {
            return;
        }
        c.answering = true;
        c.pollTimedOut = false;
        c.data.error = '';

        c.data.action = 'answer';
        c.data.sys_id = c.data.current.sys_id;
        c.data.answer = text;

        callServer().then(function () {
            c.answering = false;
            c.data.action = null;
            c.data.answer = null;
            c.answerDraft = '';
            startPolling();
        });
    };

    // =================================================================
    // New conversation
    // =================================================================

    c.askNewConversation = function () {
        c.confirmNewConversation = true;
    };

    c.cancelNewConversation = function () {
        c.confirmNewConversation = false;
    };

    /**
     * Clears the conversational memory. The cases are not deleted — they stay
     * as the audit trail — only the thread the agent gets to see is dropped.
     */
    c.newConversation = function () {
        stopPolling();
        c.confirmNewConversation = false;
        c.data.error = '';
        c.pollTimedOut = false;
        c.draft = '';
        c.answerDraft = '';
        c.showRejectForm = false;

        c.data.action = 'new_session';
        // Deliberately not sending the current session: we want a new one.
        c.data.session_id = '';
        c.data.sessionId = '';

        c.server.update().then(function () {
            c.data.action = null;
        });
    };

    // =================================================================
    // Polling
    // =================================================================

    function startPolling() {
        stopPolling();
        pollCount = 0;
        scheduleNextPoll();
    }

    function scheduleNextPoll() {
        if (!c.data.current || !c.data.current.sys_id) {
            c.polling = false;
            return;
        }
        if (shouldStopPolling(c.data.current)) {
            c.polling = false;
            return;
        }
        if (pollCount >= (c.data.maxPolls || 40)) {
            c.polling = false;
            c.pollTimedOut = true;
            return;
        }

        c.polling = true;
        pollHandle = $timeout(function () {
            pollCount++;
            c.data.action = 'poll';
            c.data.sys_id = c.data.current.sys_id;

            callServer().then(function () {
                c.data.action = null;
                scheduleNextPoll();
            });
        }, c.data.pollIntervalMs || 2500);
    }

    /**
     * Stop when there is nothing left for the runtime to do: the case is
     * closed, or it is now waiting on a human — either to approve an operation
     * or to answer a question.
     */
    function shouldStopPolling(current) {
        return !!current.is_closed || !!current.awaiting_confirmation || !!current.awaiting_answer;
    }

    function stopPolling() {
        if (pollHandle) {
            $timeout.cancel(pollHandle);
            pollHandle = null;
        }
        c.polling = false;
    }

    // Never leave a timer running behind a destroyed widget.
    $scope.$on('$destroy', stopPolling);

    // Resume polling when a page load lands on a turn still in flight.
    if (c.data.current && !shouldStopPolling(c.data.current)) {
        startPolling();
    }

    // =================================================================
    // Approval
    // =================================================================

    c.approve = function () {
        if (!c.data.current || c.deciding) {
            return;
        }
        c.deciding = true;
        c.data.action = 'approve';
        c.data.sys_id = c.data.current.sys_id;

        callServer().then(function () {
            c.deciding = false;
            c.data.action = null;
            c.showRejectForm = false;
            startPolling();
        });
    };

    c.openRejectForm = function () {
        c.showRejectForm = true;
        c.rejectReason = '';
    };

    c.cancelReject = function () {
        c.showRejectForm = false;
        c.rejectReason = '';
    };

    c.reject = function () {
        if (!c.data.current || c.rejecting) {
            return;
        }
        c.rejecting = true;
        c.data.action = 'reject';
        c.data.sys_id = c.data.current.sys_id;
        c.data.reason = (c.rejectReason || '').trim();

        callServer().then(function () {
            c.rejecting = false;
            c.data.action = null;
            c.data.reason = null;
            c.showRejectForm = false;
            c.rejectReason = '';
            stopPolling();
        });
    };

    // =================================================================
    // Presentation helpers
    // =================================================================

    /** The question the agent is waiting on, or null. */
    c.question = function () {
        var current = c.data.current;
        if (!current || !current.awaiting_answer || !current.pending_input) {
            return null;
        }
        return current.pending_input[0] || null;
    };

    /**
     * Turns the proposal payload into label/value rows the template can
     * render, so the user sees the concrete values they are approving rather
     * than a summary sentence alone.
     */
    c.proposalRows = function () {
        var proposal = c.data.current && c.data.current.proposal;
        if (!proposal || !proposal.payload) {
            return [];
        }

        var rows = [];
        flatten(proposal.payload, '', rows);
        return rows;
    };

    function flatten(obj, prefix, rows) {
        Object.keys(obj).forEach(function (key) {
            var value = obj[key];
            if (value === null || value === undefined || value === '') {
                return;
            }
            if (typeof value === 'object' && !Array.isArray(value)) {
                flatten(value, prefix ? prefix + ' ' + key : key, rows);
                return;
            }
            rows.push({
                label: humanise(prefix ? prefix + ' ' + key : key),
                value: Array.isArray(value) ? value.join(', ') : '' + value,
            });
        });
    }

    function humanise(key) {
        return ('' + key)
            .replace(/_/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^./, function (ch) {
                return ch.toUpperCase();
            });
    }

    /** A permanent block cannot be undone, so the UI must say so plainly. */
    c.isIrreversible = function () {
        var proposal = c.data.current && c.data.current.proposal;
        if (!proposal) {
            return false;
        }
        if (proposal.action === 'block_card') {
            var payload = proposal.payload || {};
            return ('' + (payload.type || '')).toLowerCase() === 'permanent';
        }
        return false;
    };

    c.retry = function () {
        c.pollTimedOut = false;
        startPolling();
    };
};
