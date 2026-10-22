/**
 * CardDataProvider
 *
 * Single read access point for the Card Management data model.
 *
 * WHY THIS EXISTS
 * ---------------
 * Consumers (portal widgets, agentic workflow tools, flows) must never query
 * the tables directly. They call this provider instead, so that when the MVP
 * tables are replaced by direct Digital Banking ESB calls, only this file
 * changes and no consumer has to be rewritten.
 *
 * THREE RULES THAT MAKE THAT POSSIBLE
 * -----------------------------------
 * 1. Business keys, never sys_id. Everything is addressed by `customer_id`,
 *    `card_id`, `transaction_id`. A sys_id is a local persistence detail that
 *    will not exist once the data comes from the API.
 * 2. Plain JS objects (DTOs) out, never GlideRecord. A GlideRecord would tie
 *    the caller to the table forever; a DTO is already shaped like a REST
 *    payload.
 * 3. No clear PAN. The contract exposes `card_id` and `last_four` only.
 *
 * VISIBILITY PERIMETER
 * --------------------
 * `bank_id` identifies the bank owning the relationship, i.e. a subset of the
 * whole customer base. Which banks a user may see comes from the Bank Access
 * mapping table, resolved by the shared CardPerimeter class.
 *
 * Enforcement is layered: the query business rules restrict rows at the data
 * layer (covering list views, the Table API, reports and agents), and this
 * provider applies the same restriction again so the adapter stays safe on its
 * own. Both call CardPerimeter, so the two layers cannot disagree.
 */
var CardDataProvider = Class.create()

CardDataProvider.prototype = {
    initialize: function () {
        this.T_CUSTOMER = 'x_snc_card_manag_1_customer'
        this.T_CARD = 'x_snc_card_manag_1_card'
        this.T_TXN = 'x_snc_card_manag_1_txn'

        this.DEFAULT_LIMIT = 50
        this.MAX_LIMIT = 500

        // Shared perimeter resolver. The same class is used by the query
        // business rules on these tables, so adapter-layer and data-layer
        // enforcement can never drift apart.
        this.perimeter = new CardPerimeter()
    },

    // =====================================================================
    // Provider metadata
    // =====================================================================

    /**
     * Describes which backend is answering. Trivial today, but after the
     * switch to the ESB it is what tells you where the data came from.
     */
    getProviderInfo: function () {
        return {
            mode: 'table',
            description: 'Local MVP tables',
            version: '1.0.0',
            readOnlyEntities: ['transaction'],
        }
    },

    // =====================================================================
    // Visibility perimeter
    // =====================================================================

    /**
     * True when the current user may see every bank.
     * Delegated to CardPerimeter, the shared resolver.
     */
    hasFullVisibility: function () {
        return this.perimeter.hasFullVisibility()
    },

    /**
     * The bank_ids the current user is entitled to, from the Bank Access
     * mapping table. An empty array means no entitlement, which yields no
     * results rather than everything.
     */
    getAccessibleBankIds: function () {
        return this.perimeter.getBankIds()
    },

    canAccessBank: function (bankId) {
        return this.perimeter.canAccess(bankId)
    },

    /**
     * Applies the perimeter to any query object (GlideRecord or
     * GlideAggregate). Callers of the public methods never do this themselves.
     *
     * Note this is the SECOND layer: the query business rules on these tables
     * already restrict rows at the data layer. Keeping it here means the
     * adapter is still safe if a rule is ever deactivated.
     *
     * @param queryObj GlideRecord or GlideAggregate
     * @param options  { bypassVisibility: true } for trusted server-side jobs
     * @return boolean false when the user has no perimeter (caller should stop)
     */
    _applyPerimeter: function (queryObj, options) {
        if (options && options.bypassVisibility) {
            return true
        }
        return this.perimeter.applyTo(queryObj)
    },

    // =====================================================================
    // Pagination helpers
    // =====================================================================

    _normalizeOptions: function (options, defaultOrderBy, defaultDesc) {
        var o = options || {}
        var limit = parseInt(o.limit, 10)
        if (isNaN(limit) || limit <= 0) {
            limit = this.DEFAULT_LIMIT
        }
        if (limit > this.MAX_LIMIT) {
            limit = this.MAX_LIMIT
        }
        var offset = parseInt(o.offset, 10)
        if (isNaN(offset) || offset < 0) {
            offset = 0
        }
        return {
            limit: limit,
            offset: offset,
            orderBy: o.orderBy || defaultOrderBy,
            orderDesc: typeof o.orderDesc === 'boolean' ? o.orderDesc : !!defaultDesc,
            bypassVisibility: !!o.bypassVisibility,
        }
    },

    _applyWindow: function (gr, opts) {
        if (opts.orderBy) {
            if (opts.orderDesc) {
                gr.orderByDesc(opts.orderBy)
            } else {
                gr.orderBy(opts.orderBy)
            }
        }
        gr.chooseWindow(opts.offset, opts.offset + opts.limit)
    },

    _emptyPage: function (opts) {
        return { total: 0, limit: opts.limit, offset: opts.offset, results: [] }
    },

    _countOf: function (table, buildFn, criteria, opts) {
        var agg = new GlideAggregate(table)
        buildFn.call(this, agg, criteria)
        if (!this._applyPerimeter(agg, opts)) {
            return 0
        }
        agg.addAggregate('COUNT')
        agg.query()
        return agg.next() ? parseInt(agg.getAggregate('COUNT'), 10) : 0
    },

    // =====================================================================
    // DTO mappers -- shaped like the future REST payloads
    // =====================================================================

    _num: function (gr, field) {
        var v = gr.getValue(field)
        return v === null || v === '' ? null : parseFloat(v)
    },

    _bool: function (gr, field) {
        return gr.getValue(field) === '1' || gr.getValue(field) === 'true'
    },

    _customerDTO: function (gr) {
        return {
            customer_id: gr.getValue('customer_id'),
            bank_id: gr.getValue('bank_id'),
            name: gr.getValue('name'),
            customer_type: gr.getValue('customer_type'),
            customer_type_label: gr.getDisplayValue('customer_type'),
            segment: gr.getValue('segment'),
            tax_id: gr.getValue('tax_id'),
            email: gr.getValue('email'),
            phone: gr.getValue('phone'),
            country: gr.getValue('country'),
            preferred_language: gr.getValue('preferred_language'),
            status: gr.getValue('status'),
            status_label: gr.getDisplayValue('status'),
            kyc_status: gr.getValue('kyc_status'),
            risk_level: gr.getValue('risk_level'),
            onboarding_date: gr.getValue('onboarding_date'),
            base_currency: gr.getValue('base_currency'),
            source_system: gr.getValue('source_system'),
            synced: this._bool(gr, 'synced'),
            last_sync: gr.getValue('last_sync'),
            notes: gr.getValue('notes'),
        }
    },

    _cardDTO: function (gr) {
        return {
            // identity -- anonymized, no clear PAN is ever exposed
            card_id: gr.getValue('card_id'),
            bank_id: gr.getValue('bank_id'),
            customer_id: gr.getValue('customer_id'),
            last_four: gr.getValue('last_four'),
            cardholder_name: gr.getValue('cardholder_name'),

            // product
            product_name: gr.getValue('product_name'),
            card_network: gr.getValue('card_network'),
            card_type: gr.getValue('card_type'),
            form_factor: gr.getValue('form_factor'),
            currency: gr.getValue('currency'),

            // lifecycle
            status: gr.getValue('status'),
            status_label: gr.getDisplayValue('status'),
            status_reason: gr.getValue('status_reason'),
            issue_date: gr.getValue('issue_date'),
            activation_date: gr.getValue('activation_date'),
            expiry_month: this._num(gr, 'expiry_month'),
            expiry_year: this._num(gr, 'expiry_year'),
            expiry_date: gr.getValue('expiry_date'),
            renewal_due: this._bool(gr, 'renewal_due'),

            // limits
            limits: {
                credit_limit: this._num(gr, 'credit_limit'),
                available_credit: this._num(gr, 'available_credit'),
                current_balance: this._num(gr, 'current_balance'),
                daily_limit: this._num(gr, 'daily_limit'),
                monthly_limit: this._num(gr, 'monthly_limit'),
                single_transaction_limit: this._num(gr, 'single_transaction_limit'),
                atm_daily_limit: this._num(gr, 'atm_daily_limit'),
                ecommerce_limit: this._num(gr, 'ecommerce_limit'),
            },

            // usage controls
            controls: {
                contactless_enabled: this._bool(gr, 'contactless_enabled'),
                ecommerce_enabled: this._bool(gr, 'ecommerce_enabled'),
                atm_enabled: this._bool(gr, 'atm_enabled'),
                international_enabled: this._bool(gr, 'international_enabled'),
                recurring_enabled: this._bool(gr, 'recurring_enabled'),
            },

            source_system: gr.getValue('source_system'),
            synced: this._bool(gr, 'synced'),
            last_sync: gr.getValue('last_sync'),
        }
    },

    _transactionDTO: function (gr) {
        return {
            transaction_id: gr.getValue('transaction_id'),
            bank_id: gr.getValue('bank_id'),
            card_id: gr.getDisplayValue('card'),

            transaction_date: gr.getValue('transaction_date'),
            posting_date: gr.getValue('posting_date'),

            direction: gr.getValue('direction'),
            amount: this._num(gr, 'amount'),
            currency: gr.getValue('currency'),
            original_amount: this._num(gr, 'original_amount'),
            original_currency: gr.getValue('original_currency'),
            exchange_rate: this._num(gr, 'exchange_rate'),
            fee_amount: this._num(gr, 'fee_amount'),

            transaction_type: gr.getValue('transaction_type'),
            transaction_type_label: gr.getDisplayValue('transaction_type'),
            channel: gr.getValue('channel'),
            status: gr.getValue('status'),
            status_label: gr.getDisplayValue('status'),

            auth_code: gr.getValue('auth_code'),
            response_code: gr.getValue('response_code'),
            decline_reason: gr.getValue('decline_reason'),
            card_present: this._bool(gr, 'card_present'),
            contactless: this._bool(gr, 'contactless'),

            merchant: {
                name: gr.getValue('merchant_name'),
                id: gr.getValue('merchant_id'),
                mcc: gr.getValue('mcc'),
                city: gr.getValue('merchant_city'),
                country: gr.getValue('merchant_country'),
                terminal_id: gr.getValue('terminal_id'),
                acquirer_id: gr.getValue('acquirer_id'),
            },

            fraud_score: this._num(gr, 'fraud_score'),
            disputed: this._bool(gr, 'disputed'),
            description: gr.getValue('description'),
        }
    },

    // =====================================================================
    // Internal record lookups (sys_id stays inside this file)
    // =====================================================================

    _getCustomerRecord: function (customerId, options) {
        if (!customerId) {
            return null
        }
        var gr = new GlideRecord(this.T_CUSTOMER)
        gr.addQuery('customer_id', '' + customerId)
        if (!this._applyPerimeter(gr, options)) {
            return null
        }
        gr.setLimit(1)
        gr.query()
        return gr.next() ? gr : null
    },

    _getCardRecord: function (cardId, options) {
        if (!cardId) {
            return null
        }
        var gr = new GlideRecord(this.T_CARD)
        gr.addQuery('card_id', '' + cardId)
        if (!this._applyPerimeter(gr, options)) {
            return null
        }
        gr.setLimit(1)
        gr.query()
        return gr.next() ? gr : null
    },

    _getTransactionRecord: function (transactionId, options) {
        if (!transactionId) {
            return null
        }
        var gr = new GlideRecord(this.T_TXN)
        gr.addQuery('transaction_id', '' + transactionId)
        if (!this._applyPerimeter(gr, options)) {
            return null
        }
        gr.setLimit(1)
        gr.query()
        return gr.next() ? gr : null
    },

    // =====================================================================
    // CUSTOMERS
    // =====================================================================

    _buildCustomerQuery: function (q, criteria) {
        var c = criteria || {}
        if (c.name) {
            q.addQuery('name', 'CONTAINS', '' + c.name)
        }
        if (c.customer_id) {
            q.addQuery('customer_id', '' + c.customer_id)
        }
        if (c.bank_id) {
            q.addQuery('bank_id', '' + c.bank_id)
        }
        if (c.tax_id) {
            q.addQuery('tax_id', 'CONTAINS', '' + c.tax_id)
        }
        if (c.email) {
            q.addQuery('email', 'CONTAINS', '' + c.email)
        }
        if (c.phone) {
            q.addQuery('phone', 'CONTAINS', '' + c.phone)
        }
        if (c.status) {
            q.addQuery('status', 'IN', '' + c.status)
        }
        if (c.segment) {
            q.addQuery('segment', 'IN', '' + c.segment)
        }
        if (c.customer_type) {
            q.addQuery('customer_type', 'IN', '' + c.customer_type)
        }
        if (c.kyc_status) {
            q.addQuery('kyc_status', 'IN', '' + c.kyc_status)
        }
        if (c.risk_level) {
            q.addQuery('risk_level', 'IN', '' + c.risk_level)
        }
        // Free-text across the fields a portal operator would actually type.
        if (c.query) {
            var term = '' + c.query
            var or = q.addQuery('name', 'CONTAINS', term)
            or.addOrCondition('customer_id', 'CONTAINS', term)
            or.addOrCondition('tax_id', 'CONTAINS', term)
            or.addOrCondition('email', 'CONTAINS', term)
        }
    },

    /**
     * Search customers. The primary portal use case is lookup by name, which
     * is a partial, case-insensitive match.
     *
     * @param criteria { name, customer_id, bank_id, tax_id, email, phone,
     *                   status, segment, customer_type, kyc_status,
     *                   risk_level, query }
     * @param options  { limit, offset, orderBy, orderDesc, bypassVisibility }
     * @return { total, limit, offset, results: [customerDTO] }
     */
    searchCustomers: function (criteria, options) {
        var opts = this._normalizeOptions(options, 'name', false)

        var gr = new GlideRecord(this.T_CUSTOMER)
        this._buildCustomerQuery(gr, criteria)
        if (!this._applyPerimeter(gr, opts)) {
            return this._emptyPage(opts)
        }
        this._applyWindow(gr, opts)
        gr.query()

        var results = []
        while (gr.next()) {
            results.push(this._customerDTO(gr))
        }

        return {
            total: this._countOf(this.T_CUSTOMER, this._buildCustomerQuery, criteria, opts),
            limit: opts.limit,
            offset: opts.offset,
            results: results,
        }
    },

    /** Single customer by business key. Null when absent or out of perimeter. */
    getCustomer: function (customerId, options) {
        var gr = this._getCustomerRecord(customerId, options)
        return gr ? this._customerDTO(gr) : null
    },

    /** Convenience: lookup by name returning the plain array of matches. */
    findCustomersByName: function (name, options) {
        return this.searchCustomers({ name: name }, options).results
    },

    /**
     * Aggregated view of a customer: cards by status, total exposure and
     * dispute count. One call gives a widget (or an agent) the whole context.
     */
    getCustomerSummary: function (customerId, options) {
        var customer = this.getCustomer(customerId, options)
        if (!customer) {
            return null
        }

        var summary = {
            customer: customer,
            cards: { total: 0, by_status: {}, active: 0, blocked: 0, renewal_due: 0 },
            exposure: { credit_limit: 0, current_balance: 0, available_credit: 0, currency: customer.base_currency },
            transactions: { disputed: 0, last_30_days_count: 0, last_30_days_amount: 0 },
        }

        var cardIds = []
        var card = new GlideRecord(this.T_CARD)
        card.addQuery('customer_id', customer.customer_id)
        card.query()
        while (card.next()) {
            var status = card.getValue('status')
            summary.cards.total++
            summary.cards.by_status[status] = (summary.cards.by_status[status] || 0) + 1
            if (status === 'active') {
                summary.cards.active++
            }
            if (status === 'blocked_temporary' || status === 'blocked_permanent') {
                summary.cards.blocked++
            }
            if (this._bool(card, 'renewal_due')) {
                summary.cards.renewal_due++
            }
            summary.exposure.credit_limit += this._num(card, 'credit_limit') || 0
            summary.exposure.current_balance += this._num(card, 'current_balance') || 0
            summary.exposure.available_credit += this._num(card, 'available_credit') || 0
            cardIds.push(card.getUniqueValue())
        }

        summary.exposure.credit_limit = Math.round(summary.exposure.credit_limit * 100) / 100
        summary.exposure.current_balance = Math.round(summary.exposure.current_balance * 100) / 100
        summary.exposure.available_credit = Math.round(summary.exposure.available_credit * 100) / 100

        if (cardIds.length) {
            var since = new GlideDateTime()
            since.addSeconds(-30 * 86400)

            var txn = new GlideRecord(this.T_TXN)
            txn.addQuery('card', 'IN', cardIds.join(','))
            txn.query()
            while (txn.next()) {
                if (this._bool(txn, 'disputed')) {
                    summary.transactions.disputed++
                }
                if (txn.getValue('transaction_date') >= since.getValue() && txn.getValue('direction') === 'debit') {
                    summary.transactions.last_30_days_count++
                    summary.transactions.last_30_days_amount += this._num(txn, 'amount') || 0
                }
            }
            summary.transactions.last_30_days_amount =
                Math.round(summary.transactions.last_30_days_amount * 100) / 100
        }

        return summary
    },

    // =====================================================================
    // CARDS
    // =====================================================================

    _buildCardQuery: function (q, criteria) {
        var c = criteria || {}
        if (c.card_id) {
            q.addQuery('card_id', '' + c.card_id)
        }
        if (c.customer_id) {
            q.addQuery('customer_id', '' + c.customer_id)
        }
        if (c.bank_id) {
            q.addQuery('bank_id', '' + c.bank_id)
        }
        if (c.last_four) {
            q.addQuery('last_four', '' + c.last_four)
        }
        if (c.cardholder_name) {
            q.addQuery('cardholder_name', 'CONTAINS', '' + c.cardholder_name)
        }
        if (c.status) {
            q.addQuery('status', 'IN', '' + c.status)
        }
        if (c.card_network) {
            q.addQuery('card_network', 'IN', '' + c.card_network)
        }
        if (c.card_type) {
            q.addQuery('card_type', 'IN', '' + c.card_type)
        }
        if (c.form_factor) {
            q.addQuery('form_factor', 'IN', '' + c.form_factor)
        }
        if (c.renewal_due === true || c.renewal_due === 'true') {
            q.addQuery('renewal_due', true)
        }
        if (c.product_name) {
            q.addQuery('product_name', 'CONTAINS', '' + c.product_name)
        }
        if (c.query) {
            var term = '' + c.query
            var or = q.addQuery('card_id', 'CONTAINS', term)
            or.addOrCondition('last_four', 'CONTAINS', term)
            or.addOrCondition('cardholder_name', 'CONTAINS', term)
            or.addOrCondition('customer_id', 'CONTAINS', term)
        }
    },

    /**
     * Single card by its anonymized identifier -- the primary card lookup.
     * `card_id` is unique, so this returns one DTO or null.
     */
    getCard: function (cardId, options) {
        var gr = this._getCardRecord(cardId, options)
        return gr ? this._cardDTO(gr) : null
    },

    /**
     * Search cards.
     *
     * @param criteria { card_id, customer_id, bank_id, last_four,
     *                   cardholder_name, status, card_network, card_type,
     *                   form_factor, renewal_due, product_name, query }
     */
    searchCards: function (criteria, options) {
        var opts = this._normalizeOptions(options, 'card_id', false)

        var gr = new GlideRecord(this.T_CARD)
        this._buildCardQuery(gr, criteria)
        if (!this._applyPerimeter(gr, opts)) {
            return this._emptyPage(opts)
        }
        this._applyWindow(gr, opts)
        gr.query()

        var results = []
        while (gr.next()) {
            results.push(this._cardDTO(gr))
        }

        return {
            total: this._countOf(this.T_CARD, this._buildCardQuery, criteria, opts),
            limit: opts.limit,
            offset: opts.offset,
            results: results,
        }
    },

    /** All cards of a customer -- the most frequent portal navigation. */
    getCardsByCustomer: function (customerId, options) {
        if (!customerId) {
            return []
        }
        return this.searchCards({ customer_id: customerId }, options).results
    },

    /**
     * Operational snapshot of a single card: recent spend, pending and
     * disputed counts, and utilisation against the credit limit.
     */
    getCardSummary: function (cardId, options) {
        var cardRec = this._getCardRecord(cardId, options)
        if (!cardRec) {
            return null
        }
        var dto = this._cardDTO(cardRec)
        var cardSysId = cardRec.getUniqueValue()

        var summary = {
            card: dto,
            transactions: {
                total: 0,
                pending: 0,
                authorized: 0,
                declined: 0,
                disputed: 0,
                last_30_days_count: 0,
                last_30_days_amount: 0,
            },
            utilisation: null,
        }

        var since = new GlideDateTime()
        since.addSeconds(-30 * 86400)

        var txn = new GlideRecord(this.T_TXN)
        txn.addQuery('card', cardSysId)
        txn.query()
        while (txn.next()) {
            summary.transactions.total++
            var st = txn.getValue('status')
            if (st === 'pending') {
                summary.transactions.pending++
            }
            if (st === 'authorized') {
                summary.transactions.authorized++
            }
            if (st === 'declined') {
                summary.transactions.declined++
            }
            if (this._bool(txn, 'disputed')) {
                summary.transactions.disputed++
            }
            if (txn.getValue('transaction_date') >= since.getValue() && txn.getValue('direction') === 'debit') {
                summary.transactions.last_30_days_count++
                summary.transactions.last_30_days_amount += this._num(txn, 'amount') || 0
            }
        }
        summary.transactions.last_30_days_amount = Math.round(summary.transactions.last_30_days_amount * 100) / 100

        var limit = dto.limits.credit_limit
        var balance = dto.limits.current_balance
        if (limit && limit > 0 && balance !== null) {
            summary.utilisation = Math.round((balance / limit) * 10000) / 100
        }

        return summary
    },

    // =====================================================================
    // TRANSACTIONS (read-only entity)
    // =====================================================================

    _buildTransactionQuery: function (q, criteria) {
        var c = criteria || {}
        // _cardSysId is resolved by the caller: transactions are always
        // reached through their card, never through the customer.
        if (c._cardSysId) {
            q.addQuery('card', c._cardSysId)
        }
        if (c.transaction_id) {
            q.addQuery('transaction_id', '' + c.transaction_id)
        }
        if (c.bank_id) {
            q.addQuery('bank_id', '' + c.bank_id)
        }
        if (c.status) {
            q.addQuery('status', 'IN', '' + c.status)
        }
        if (c.transaction_type) {
            q.addQuery('transaction_type', 'IN', '' + c.transaction_type)
        }
        if (c.channel) {
            q.addQuery('channel', 'IN', '' + c.channel)
        }
        if (c.direction) {
            q.addQuery('direction', '' + c.direction)
        }
        if (c.dateFrom) {
            q.addQuery('transaction_date', '>=', '' + c.dateFrom)
        }
        if (c.dateTo) {
            q.addQuery('transaction_date', '<=', '' + c.dateTo)
        }
        if (c.minAmount !== undefined && c.minAmount !== null && c.minAmount !== '') {
            q.addQuery('amount', '>=', c.minAmount)
        }
        if (c.maxAmount !== undefined && c.maxAmount !== null && c.maxAmount !== '') {
            q.addQuery('amount', '<=', c.maxAmount)
        }
        if (c.disputedOnly === true || c.disputedOnly === 'true') {
            q.addQuery('disputed', true)
        }
        if (c.minFraudScore !== undefined && c.minFraudScore !== null && c.minFraudScore !== '') {
            q.addQuery('fraud_score', '>=', c.minFraudScore)
        }
        if (c.merchant_name) {
            q.addQuery('merchant_name', 'CONTAINS', '' + c.merchant_name)
        }
    },

    /**
     * Transactions of a card, newest first -- the primary transaction lookup.
     * Consistent with the data model, movements are always reached from the
     * card and never directly from the customer.
     *
     * @param cardId  anonymized card identifier
     * @param filters { status, transaction_type, channel, direction, dateFrom,
     *                  dateTo, minAmount, maxAmount, disputedOnly,
     *                  minFraudScore, merchant_name }
     * @param options { limit, offset, orderBy, orderDesc, bypassVisibility }
     */
    getTransactionsByCard: function (cardId, filters, options) {
        var opts = this._normalizeOptions(options, 'transaction_date', true)

        var cardRec = this._getCardRecord(cardId, opts)
        if (!cardRec) {
            return this._emptyPage(opts)
        }

        var criteria = {}
        var f = filters || {}
        for (var k in f) {
            if (f.hasOwnProperty(k)) {
                criteria[k] = f[k]
            }
        }
        criteria._cardSysId = cardRec.getUniqueValue()

        var gr = new GlideRecord(this.T_TXN)
        this._buildTransactionQuery(gr, criteria)
        if (!this._applyPerimeter(gr, opts)) {
            return this._emptyPage(opts)
        }
        this._applyWindow(gr, opts)
        gr.query()

        var results = []
        while (gr.next()) {
            results.push(this._transactionDTO(gr))
        }

        return {
            total: this._countOf(this.T_TXN, this._buildTransactionQuery, criteria, opts),
            limit: opts.limit,
            offset: opts.offset,
            results: results,
            card_id: cardRec.getValue('card_id'),
        }
    },

    /** Single transaction by business key. */
    getTransaction: function (transactionId, options) {
        var gr = this._getTransactionRecord(transactionId, options)
        return gr ? this._transactionDTO(gr) : null
    },

    type: 'CardDataProvider',
}
