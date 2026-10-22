/**
 * CardOperations
 *
 * Write operations on cards and customers.
 *
 * WHY THIS IS SEPARATE FROM CardDataProvider
 * ------------------------------------------
 * The provider is a thin, replaceable data-access layer: it gets rewritten
 * when the MVP tables give way to direct ESB calls. Business logic placed
 * there would have to be rewritten with it. Operations therefore live here,
 * use the provider for reads, and stay untouched by that switch.
 *
 * IMMUTABLE BY CONTRACT
 * ---------------------
 * Identifiers are never writable: `customer_id`, `card_id`, `transaction_id`
 * and `bank_id`. `bank_id` in particular defines the visibility perimeter, so
 * changing it would be a tenancy migration, not an update -- it is out of
 * scope for this API entirely.
 *
 * Source-owned fields are read-only too: `current_balance` is produced by the
 * authorisation system, and `available_credit` is derived from it. The only
 * place `available_credit` changes is inside updateCardLimits, which keeps it
 * consistent with `credit_limit` so no caller can leave the two out of sync.
 *
 * Transactions are a read-only entity. The single, deliberate exception is
 * disputeTransaction, which touches only `disputed` and `status`. A dispute is
 * really a business object with its own lifecycle; modelling it as a flag is
 * an accepted MVP shortcut.
 *
 * Every method returns the same shape -- { success, message, data } -- which
 * suits both portal widgets and agentic workflow tools.
 */
var CardOperations = Class.create()

CardOperations.prototype = {
    initialize: function () {
        this.T_CUSTOMER = 'x_snc_card_manag_1_customer'
        this.T_CARD = 'x_snc_card_manag_1_card'
        this.T_TXN = 'x_snc_card_manag_1_txn'

        this.provider = new CardDataProvider()

        // --- card lifecycle rules ------------------------------------
        // A temporary block is reversible; a permanent block is final.
        this.TEMPORARY_BLOCKABLE = ['issued', 'active']
        this.PERMANENT_BLOCKABLE = ['issued', 'active', 'blocked_temporary']
        this.UNBLOCKABLE_FROM = ['blocked_temporary']

        this.BLOCK_REASONS = [
            'customer_request',
            'lost',
            'stolen',
            'fraud_suspected',
            'damaged',
            'never_received',
            'issuer_decision',
        ]

        // --- field whitelists ----------------------------------------
        // Contact data only. Name, tax_id, type, segment, status, KYC and risk
        // are governed by onboarding or by the bank, not by a front-end
        // operator, so they stay read-only here.
        this.CUSTOMER_EDITABLE = ['email', 'phone', 'country', 'preferred_language', 'notes']

        this.LIMIT_FIELDS = [
            'credit_limit',
            'daily_limit',
            'monthly_limit',
            'single_transaction_limit',
            'atm_daily_limit',
            'ecommerce_limit',
        ]

        this.CONTROL_FIELDS = [
            'contactless_enabled',
            'ecommerce_enabled',
            'atm_enabled',
            'international_enabled',
            'recurring_enabled',
        ]
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

    _toBool: function (v) {
        if (typeof v === 'boolean') {
            return v
        }
        var s = ('' + v).toLowerCase()
        return s === 'true' || s === '1' || s === 'yes'
    },

    _isBoolLike: function (v) {
        if (typeof v === 'boolean') {
            return true
        }
        var s = ('' + v).toLowerCase()
        return ['true', 'false', '1', '0', 'yes', 'no'].indexOf(s) !== -1
    },

    _audit: function (action, entity, id, detail) {
        gs.info(
            '[CardOperations] ' +
                action +
                ' ' +
                entity +
                '=' +
                id +
                ' by=' +
                gs.getUserName() +
                (detail ? ' | ' + detail : ''),
        )
    },

    // =====================================================================
    // Shared record resolution + perimeter enforcement
    // =====================================================================

    /**
     * Resolves a writable card record, enforcing the visibility perimeter.
     * Returns { error } on failure or { record } on success.
     */
    _resolveCard: function (cardId) {
        if (!cardId) {
            return { error: this._fail('card_id is required.') }
        }
        var gr = new GlideRecord(this.T_CARD)
        gr.addQuery('card_id', '' + cardId)
        gr.setLimit(1)
        gr.query()
        if (!gr.next()) {
            return { error: this._fail('Card not found: ' + cardId) }
        }
        if (!this.provider.canAccessBank(gr.getValue('bank_id'))) {
            return { error: this._fail('Not authorized to operate on this card.') }
        }
        return { record: gr }
    },

    _resolveCustomer: function (customerId) {
        if (!customerId) {
            return { error: this._fail('customer_id is required.') }
        }
        var gr = new GlideRecord(this.T_CUSTOMER)
        gr.addQuery('customer_id', '' + customerId)
        gr.setLimit(1)
        gr.query()
        if (!gr.next()) {
            return { error: this._fail('Customer not found: ' + customerId) }
        }
        if (!this.provider.canAccessBank(gr.getValue('bank_id'))) {
            return { error: this._fail('Not authorized to operate on this customer.') }
        }
        return { record: gr }
    },

    // =====================================================================
    // CARD -- block / unblock
    // =====================================================================

    /**
     * Blocks a card.
     *
     * @param cardId  anonymized card identifier
     * @param options { type: 'temporary'|'permanent', reason, notes }
     *
     * A permanent block is final: unblockCard will refuse it afterwards, which
     * mirrors real practice -- a card blocked for fraud is reissued, not
     * revived.
     */
    blockCard: function (cardId, options) {
        var o = options || {}
        var type = ('' + (o.type || 'temporary')).toLowerCase()
        var reason = o.reason ? '' + o.reason : ''

        if (type !== 'temporary' && type !== 'permanent') {
            return this._fail("type must be 'temporary' or 'permanent'.")
        }
        if (!reason) {
            return this._fail('reason is required to block a card. Allowed: ' + this.BLOCK_REASONS.join(', '))
        }
        if (this.BLOCK_REASONS.indexOf(reason) === -1) {
            return this._fail('Invalid reason "' + reason + '". Allowed: ' + this.BLOCK_REASONS.join(', '))
        }

        var res = this._resolveCard(cardId)
        if (res.error) {
            return res.error
        }
        var card = res.record
        var current = card.getValue('status')

        var allowed = type === 'permanent' ? this.PERMANENT_BLOCKABLE : this.TEMPORARY_BLOCKABLE
        if (allowed.indexOf(current) === -1) {
            if (current === 'blocked_permanent') {
                return this._fail('Card is already permanently blocked. This status is final.')
            }
            if (current === 'blocked_temporary' && type === 'temporary') {
                return this._fail('Card is already temporarily blocked.')
            }
            return this._fail(
                'Cannot apply a ' + type + ' block to a card in status "' + current + '". ' +
                    'Allowed source statuses: ' + allowed.join(', ') + '.',
            )
        }

        var newStatus = type === 'permanent' ? 'blocked_permanent' : 'blocked_temporary'
        card.setValue('status', newStatus)
        card.setValue('status_reason', reason)
        if (o.notes) {
            card.setValue('notes', o.notes)
        }
        card.update()

        this._audit('BLOCK', 'card', cardId, 'type=' + type + ' reason=' + reason + ' from=' + current)

        return this._ok('Card ' + cardId + ' blocked (' + type + ').', {
            card_id: cardId,
            previous_status: current,
            status: newStatus,
            status_reason: reason,
            reversible: type === 'temporary',
        })
    },

    /**
     * Unblocks a card, returning it to `active`.
     * Only a temporary block can be lifted -- a permanent block is definitive.
     */
    unblockCard: function (cardId, options) {
        var o = options || {}

        var res = this._resolveCard(cardId)
        if (res.error) {
            return res.error
        }
        var card = res.record
        var current = card.getValue('status')

        if (current === 'blocked_permanent') {
            return this._fail(
                'Card is permanently blocked and cannot be unblocked. A permanent block is final: issue a replacement card instead.',
            )
        }
        if (this.UNBLOCKABLE_FROM.indexOf(current) === -1) {
            return this._fail(
                'Card is not temporarily blocked (current status: "' + current + '"), so there is nothing to unblock.',
            )
        }

        card.setValue('status', 'active')
        card.setValue('status_reason', '')
        if (o.notes) {
            card.setValue('notes', o.notes)
        }
        card.update()

        this._audit('UNBLOCK', 'card', cardId, 'reason=' + (o.reason || 'n/a'))

        return this._ok('Card ' + cardId + ' unblocked and set to active.', {
            card_id: cardId,
            previous_status: current,
            status: 'active',
        })
    },

    // =====================================================================
    // CARD -- limits
    // =====================================================================

    /**
     * Updates one or more spending limits.
     *
     * Validation enforces the natural hierarchy of the ceilings and keeps
     * `available_credit` consistent with any new `credit_limit`.
     *
     * The credit_limit ceiling is applied only to credit and charge cards:
     * debit and prepaid products legitimately carry credit_limit = 0 while
     * still having daily and monthly spend caps.
     *
     * @param cardId
     * @param limits partial object with any of the LIMIT_FIELDS
     */
    updateCardLimits: function (cardId, limits) {
        if (!limits || typeof limits !== 'object') {
            return this._fail('limits object is required. Allowed fields: ' + this.LIMIT_FIELDS.join(', '))
        }

        var res = this._resolveCard(cardId)
        if (res.error) {
            return res.error
        }
        var card = res.record
        var status = card.getValue('status')

        if (['cancelled', 'expired', 'blocked_permanent'].indexOf(status) !== -1) {
            return this._fail('Cannot change limits on a card in status "' + status + '".')
        }

        // --- reject unknown and non-numeric values -------------------
        var rejected = []
        var proposed = {}
        for (var key in limits) {
            if (!limits.hasOwnProperty(key)) {
                continue
            }
            if (this.LIMIT_FIELDS.indexOf(key) === -1) {
                rejected.push(key)
                continue
            }
            var num = parseFloat(limits[key])
            if (isNaN(num)) {
                return this._fail('Limit "' + key + '" must be numeric.')
            }
            if (num < 0) {
                return this._fail('Limit "' + key + '" cannot be negative.')
            }
            proposed[key] = Math.round(num * 100) / 100
        }
        if (rejected.length) {
            return this._fail(
                'Unknown or read-only limit field(s): ' + rejected.join(', ') +
                    '. Allowed: ' + this.LIMIT_FIELDS.join(', '),
            )
        }
        if (!Object.keys(proposed).length) {
            return this._fail('No valid limit provided.')
        }

        // --- merge with current values so partial updates validate ---
        var effective = {}
        for (var i = 0; i < this.LIMIT_FIELDS.length; i++) {
            var f = this.LIMIT_FIELDS[i]
            var cur = parseFloat(card.getValue(f))
            effective[f] = proposed.hasOwnProperty(f) ? proposed[f] : isNaN(cur) ? 0 : cur
        }

        var errors = this._validateLimitHierarchy(effective, card.getValue('card_type'))
        if (errors.length) {
            return this._fail('Limit validation failed: ' + errors.join(' '), { violations: errors })
        }

        // --- apply ---------------------------------------------------
        var changed = {}
        for (var k in proposed) {
            if (proposed.hasOwnProperty(k)) {
                changed[k] = { from: parseFloat(card.getValue(k)), to: proposed[k] }
                card.setValue(k, proposed[k])
            }
        }

        // available_credit is derived, never supplied by the caller
        if (proposed.hasOwnProperty('credit_limit')) {
            var balance = parseFloat(card.getValue('current_balance'))
            if (isNaN(balance)) {
                balance = 0
            }
            var available = Math.round((proposed.credit_limit - balance) * 100) / 100
            card.setValue('available_credit', available < 0 ? 0 : available)
        }

        card.update()

        var detail = []
        for (var c in changed) {
            if (changed.hasOwnProperty(c)) {
                detail.push(c + ':' + changed[c].from + '->' + changed[c].to)
            }
        }
        this._audit('LIMITS', 'card', cardId, detail.join(' '))

        return this._ok('Limits updated for card ' + cardId + '.', {
            card_id: cardId,
            changed: changed,
            limits: this.provider.getCard(cardId) ? this.provider.getCard(cardId).limits : null,
        })
    },

    /**
     * The ceiling hierarchy:
     *   single_transaction_limit <= daily_limit <= monthly_limit
     *   atm_daily_limit          <= daily_limit
     *   ecommerce_limit          <= monthly_limit
     *   monthly_limit            <= credit_limit   (credit/charge only)
     */
    _validateLimitHierarchy: function (v, cardType) {
        var errors = []

        if (v.single_transaction_limit > v.daily_limit && v.daily_limit > 0) {
            errors.push('single_transaction_limit (' + v.single_transaction_limit + ') exceeds daily_limit (' + v.daily_limit + ').')
        }
        if (v.daily_limit > v.monthly_limit && v.monthly_limit > 0) {
            errors.push('daily_limit (' + v.daily_limit + ') exceeds monthly_limit (' + v.monthly_limit + ').')
        }
        if (v.atm_daily_limit > v.daily_limit && v.daily_limit > 0) {
            errors.push('atm_daily_limit (' + v.atm_daily_limit + ') exceeds daily_limit (' + v.daily_limit + ').')
        }
        if (v.ecommerce_limit > v.monthly_limit && v.monthly_limit > 0) {
            errors.push('ecommerce_limit (' + v.ecommerce_limit + ') exceeds monthly_limit (' + v.monthly_limit + ').')
        }

        // Revolving products only: debit/prepaid have no credit line.
        var revolving = cardType === 'credit' || cardType === 'charge'
        if (revolving && v.credit_limit > 0 && v.monthly_limit > v.credit_limit) {
            errors.push('monthly_limit (' + v.monthly_limit + ') exceeds credit_limit (' + v.credit_limit + ').')
        }

        return errors
    },

    // =====================================================================
    // CARD -- usage controls
    // =====================================================================

    /**
     * Toggles the usage control flags.
     *
     * @param cardId
     * @param controls partial object with any of the CONTROL_FIELDS
     */
    updateCardControls: function (cardId, controls) {
        if (!controls || typeof controls !== 'object') {
            return this._fail('controls object is required. Allowed fields: ' + this.CONTROL_FIELDS.join(', '))
        }

        var res = this._resolveCard(cardId)
        if (res.error) {
            return res.error
        }
        var card = res.record
        var status = card.getValue('status')

        if (['cancelled', 'expired', 'blocked_permanent'].indexOf(status) !== -1) {
            return this._fail('Cannot change usage controls on a card in status "' + status + '".')
        }

        var rejected = []
        var proposed = {}
        for (var key in controls) {
            if (!controls.hasOwnProperty(key)) {
                continue
            }
            if (this.CONTROL_FIELDS.indexOf(key) === -1) {
                rejected.push(key)
                continue
            }
            if (!this._isBoolLike(controls[key])) {
                return this._fail('Control "' + key + '" must be a boolean.')
            }
            proposed[key] = this._toBool(controls[key])
        }
        if (rejected.length) {
            return this._fail(
                'Unknown control field(s): ' + rejected.join(', ') + '. Allowed: ' + this.CONTROL_FIELDS.join(', '),
            )
        }
        if (!Object.keys(proposed).length) {
            return this._fail('No valid control flag provided.')
        }

        var changed = {}
        for (var k in proposed) {
            if (proposed.hasOwnProperty(k)) {
                var was = card.getValue(k) === '1'
                if (was !== proposed[k]) {
                    changed[k] = { from: was, to: proposed[k] }
                }
                card.setValue(k, proposed[k])
            }
        }
        card.update()

        var detail = []
        for (var c in changed) {
            if (changed.hasOwnProperty(c)) {
                detail.push(c + ':' + changed[c].from + '->' + changed[c].to)
            }
        }
        this._audit('CONTROLS', 'card', cardId, detail.length ? detail.join(' ') : 'no effective change')

        return this._ok('Usage controls updated for card ' + cardId + '.', {
            card_id: cardId,
            changed: changed,
            controls: this.provider.getCard(cardId) ? this.provider.getCard(cardId).controls : null,
        })
    },

    // =====================================================================
    // CUSTOMER -- contact data
    // =====================================================================

    /**
     * Updates customer contact data.
     *
     * Only CUSTOMER_EDITABLE fields are accepted. Anything else -- identifiers,
     * name, tax_id, type, segment, status, KYC, risk -- is rejected explicitly
     * rather than silently ignored, so a caller never believes a change landed
     * when it did not.
     */
    updateCustomer: function (customerId, data) {
        if (!data || typeof data !== 'object') {
            return this._fail('data object is required. Editable fields: ' + this.CUSTOMER_EDITABLE.join(', '))
        }

        var res = this._resolveCustomer(customerId)
        if (res.error) {
            return res.error
        }
        var customer = res.record

        var rejected = []
        var proposed = {}
        for (var key in data) {
            if (!data.hasOwnProperty(key)) {
                continue
            }
            if (this.CUSTOMER_EDITABLE.indexOf(key) === -1) {
                rejected.push(key)
                continue
            }
            proposed[key] = data[key] === null || data[key] === undefined ? '' : '' + data[key]
        }
        if (rejected.length) {
            return this._fail(
                'Field(s) not editable: ' + rejected.join(', ') +
                    '. Editable fields are limited to contact data: ' + this.CUSTOMER_EDITABLE.join(', ') + '.',
            )
        }
        if (!Object.keys(proposed).length) {
            return this._fail('No editable field provided.')
        }

        // --- light format validation ---------------------------------
        if (proposed.hasOwnProperty('email') && proposed.email) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(proposed.email)) {
                return this._fail('Invalid email format: ' + proposed.email)
            }
        }
        if (proposed.hasOwnProperty('country') && proposed.country) {
            if (!/^[A-Za-z]{2}$/.test(proposed.country)) {
                return this._fail('country must be a 2-letter ISO code (e.g. IT).')
            }
            proposed.country = proposed.country.toUpperCase()
        }
        if (proposed.hasOwnProperty('preferred_language') && proposed.preferred_language) {
            if (!/^[A-Za-z]{2}(-[A-Za-z]{2})?$/.test(proposed.preferred_language)) {
                return this._fail('preferred_language must be a language code (e.g. it, en, en-GB).')
            }
            proposed.preferred_language = proposed.preferred_language.toLowerCase()
        }

        var changed = {}
        for (var k in proposed) {
            if (proposed.hasOwnProperty(k)) {
                var was = customer.getValue(k)
                if (was !== proposed[k]) {
                    changed[k] = { from: was, to: proposed[k] }
                }
                customer.setValue(k, proposed[k])
            }
        }
        customer.update()

        this._audit('UPDATE', 'customer', customerId, Object.keys(changed).join(','))

        return this._ok('Customer ' + customerId + ' updated.', {
            customer_id: customerId,
            changed: changed,
            customer: this.provider.getCustomer(customerId),
        })
    },

    // =====================================================================
    // TRANSACTION -- the one controlled exception to read-only
    // =====================================================================

    /**
     * Flags a transaction as disputed.
     *
     * Transactions are otherwise a read-only entity: this method writes only
     * `disputed` and `status`, nothing else. Treating a dispute as a flag is an
     * MVP simplification -- a dispute has its own lifecycle (evidence, SLA,
     * chargeback outcome) and will eventually deserve its own entity.
     *
     * @param transactionId
     * @param reason free-text reason, required
     */
    disputeTransaction: function (transactionId, reason) {
        if (!transactionId) {
            return this._fail('transaction_id is required.')
        }
        if (!reason) {
            return this._fail('A reason is required to dispute a transaction.')
        }

        var gr = new GlideRecord(this.T_TXN)
        gr.addQuery('transaction_id', '' + transactionId)
        gr.setLimit(1)
        gr.query()
        if (!gr.next()) {
            return this._fail('Transaction not found: ' + transactionId)
        }
        if (!this.provider.canAccessBank(gr.getValue('bank_id'))) {
            return this._fail('Not authorized to operate on this transaction.')
        }

        if (gr.getValue('disputed') === '1') {
            return this._fail('Transaction ' + transactionId + ' is already disputed.')
        }

        var status = gr.getValue('status')
        var disputable = ['settled', 'authorized']
        if (disputable.indexOf(status) === -1) {
            return this._fail(
                'Only settled or authorized transactions can be disputed (current status: "' + status + '").',
            )
        }

        gr.setValue('disputed', true)
        gr.setValue('status', 'disputed')
        gr.update()

        this._audit('DISPUTE', 'transaction', transactionId, 'from=' + status + ' reason=' + reason)

        return this._ok('Transaction ' + transactionId + ' flagged as disputed.', {
            transaction_id: transactionId,
            previous_status: status,
            status: 'disputed',
            reason: '' + reason,
        })
    },

    type: 'CardOperations',
}
