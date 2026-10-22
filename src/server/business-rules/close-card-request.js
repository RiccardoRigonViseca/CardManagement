/**
 * Card Request — close the case consistently.
 *
 * Runs before update whenever `state` changes. Its job is to make sure a
 * closed case is never half-closed: a terminal state always carries a closure
 * timestamp, a measured duration and an outcome.
 *
 * WHY DERIVE THE OUTCOME HERE
 * ---------------------------
 * `state` and `outcome` are separate on purpose — "refused by a business rule"
 * is a correct run of the system, not a failure. But two fields can drift
 * apart, and a case closed as Refused with an empty outcome would quietly
 * corrupt any reporting built on it. So when the agentic layer sets a terminal
 * state without stating an outcome, the obvious one is filled in here. An
 * outcome the caller DID supply is never overwritten: the agent knows more
 * than this rule does.
 */
;(function executeRule(current, previous) {
    var TERMINAL = {
        completed: 'success',
        refused: 'refused',
        failed: 'failed',
        cancelled: 'cancelled',
    }

    var state = current.getValue('state')
    var isTerminal = TERMINAL.hasOwnProperty(state)

    if (isTerminal) {
        // --- closure timestamp -------------------------------------
        if (!current.getValue('closed_at')) {
            current.setValue('closed_at', new GlideDateTime().getValue())
        }

        // --- measured duration, from opening to closure -------------
        if (!current.getValue('processing_seconds')) {
            var openedRaw = current.getValue('opened_at')
            var closedRaw = current.getValue('closed_at')
            if (openedRaw && closedRaw) {
                var opened = new GlideDateTime(openedRaw)
                var closed = new GlideDateTime(closedRaw)
                var elapsed = Math.round((closed.getNumericValue() - opened.getNumericValue()) / 1000)
                if (elapsed >= 0) {
                    current.setValue('processing_seconds', elapsed)
                }
            }
        }

        // --- outcome: fill the obvious one, never override ----------
        if (!current.getValue('outcome')) {
            current.setValue('outcome', TERMINAL[state])
        }

        // --- a pending approval cannot outlive its case -------------
        if (current.getValue('confirmation_state') === 'pending') {
            current.setValue('confirmation_state', state === 'cancelled' ? 'rejected' : 'expired')
        }
    } else {
        // Reopened: clear the closure stamps so the next closure is measured
        // from scratch rather than inheriting stale values.
        current.setValue('closed_at', '')
        current.setValue('processing_seconds', '')
    }

    // --- stamp who confirmed, when it was not recorded -------------
    var confirmation = current.getValue('confirmation_state')
    if ((confirmation === 'approved' || confirmation === 'rejected') && !current.getValue('confirmed_at')) {
        current.setValue('confirmed_at', new GlideDateTime().getValue())
        if (!current.getValue('confirmed_by')) {
            current.setValue('confirmed_by', gs.getUserID())
        }
    }
})(current, previous)
