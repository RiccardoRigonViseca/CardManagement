/**
 * Card Request — stamp identity and validate the bank on insert.
 *
 * THIS IS THE TRUST BOUNDARY
 * --------------------------
 * The whole multi-tenant perimeter rests on `bank_id` being truthful. A portal
 * widget sends whatever its payload contains, so if the caller could choose
 * its own bank_id it could raise a request against another bank and have the
 * agent operate on it — the agent runs as the caller, but it would be acting
 * on a case that was never theirs to open.
 *
 * So both identity fields are overwritten here from the session, never read
 * from the incoming record:
 *
 *   requested_by — always the current user, whatever was submitted.
 *   bank_id      — derived from, or validated against, the caller's Bank Access
 *                  entitlement.
 *
 * Resolution rules for bank_id:
 *   - one entitled bank        -> forced to that bank, any submitted value ignored
 *   - several entitled banks   -> the submitted value must be one of them
 *   - full visibility (admin)  -> a submitted value is honoured, but must exist
 *   - no entitlement at all    -> insert is aborted
 */
;(function executeRule(current, previous) {
    var perimeter = new CardPerimeter()
    var submittedBank = current.getValue('bank_id')

    // --- identity always comes from the session -----------------------
    current.setValue('requested_by', gs.getUserID())

    if (!current.getValue('opened_at')) {
        current.setValue('opened_at', new GlideDateTime().getValue())
    }
    if (!current.getValue('state')) {
        current.setValue('state', 'new')
    }

    // --- derive a summary when the caller did not supply one ----------
    if (!current.getValue('short_description')) {
        var msg = '' + (current.getValue('message') || '')
        var oneLine = msg.replace(/\s+/g, ' ').trim()
        if (oneLine) {
            current.setValue('short_description', oneLine.substring(0, 157) + (oneLine.length > 157 ? '...' : ''))
        }
    }

    // --- resolve and enforce the bank perimeter -----------------------
    if (perimeter.hasFullVisibility()) {
        // Internal staff may open a case for any bank, but must name one that
        // actually exists — a typo would create an orphan case nobody sees.
        if (!submittedBank) {
            gs.addErrorMessage('A Bank ID is required when opening a request with cross-bank visibility.')
            current.setAbortAction(true)
            return
        }
        var check = new GlideRecord('x_snc_card_manag_1_customer')
        check.addQuery('bank_id', submittedBank)
        check.setLimit(1)
        check.query()
        if (!check.hasNext()) {
            gs.addErrorMessage('Unknown Bank ID "' + submittedBank + '". No customer belongs to that bank.')
            current.setAbortAction(true)
        }
        return
    }

    var banks = perimeter.getBankIds()

    if (!banks.length) {
        gs.addErrorMessage(
            'You are not entitled to any bank, so you cannot open a card request. Ask an administrator for a Bank Access entitlement.',
        )
        current.setAbortAction(true)
        return
    }

    if (banks.length === 1) {
        // Single entitlement: ignore whatever arrived and force the real one.
        current.setValue('bank_id', banks[0])
        return
    }

    // Several entitlements: the caller must say which, and it must be theirs.
    if (!submittedBank) {
        gs.addErrorMessage(
            'You are entitled to several banks (' + banks.join(', ') + '). Specify which Bank ID this request belongs to.',
        )
        current.setAbortAction(true)
        return
    }
    if (banks.indexOf(submittedBank) === -1) {
        gs.addErrorMessage('You are not entitled to bank "' + submittedBank + '".')
        current.setAbortAction(true)
    }
})(current, previous)
