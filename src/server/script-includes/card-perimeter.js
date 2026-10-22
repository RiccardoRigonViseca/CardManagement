/**
 * CardPerimeter
 *
 * Resolves the multi-tenant visibility perimeter of the current user.
 *
 * This is deliberately a tiny, standalone script include rather than logic
 * inside CardDataProvider, because TWO different layers need the exact same
 * answer and must never disagree:
 *
 *   1. the query business rules on the data tables (data-layer enforcement,
 *      which also covers list views, the Table API, reports and agents), and
 *   2. CardDataProvider (adapter-layer enforcement).
 *
 * Duplicating the rule in both places would be a security bug waiting to
 * happen, so both call this class.
 *
 * ENTITLEMENT MODEL
 * -----------------
 * A user's banks come from the Bank Access mapping table. Roles decide only
 * whether the perimeter applies at all: a user holding one of the
 * full-visibility roles sees every bank, which is why that role must never be
 * granted to a bank user.
 *
 * FAIL CLOSED
 * -----------
 * A user with no mapping and no full-visibility role gets an EMPTY list, which
 * callers must translate into "no results" -- never into "all results".
 */
var CardPerimeter = Class.create()

CardPerimeter.prototype = {
    initialize: function () {
        this.T_BANK_ACCESS = 'x_snc_card_manag_1_bank_access'

        // Sentinel used to force an always-false query when the user has no
        // entitlement. Filtering on an impossible value is safer than skipping
        // the filter, which would silently expose everything.
        this.NO_ACCESS = '__no_bank_access__'

        this._banks = null
        this._full = null
    },

    /**
     * True when the current user may see every bank.
     * Role list is configurable so it can be widened without a code change.
     */
    hasFullVisibility: function () {
        if (this._full !== null) {
            return this._full
        }

        var full = false
        if (gs.hasRole('admin')) {
            full = true
        } else {
            var roles = gs.getProperty(
                'x_snc_card_manag_1.full_visibility_roles',
                'x_snc_card_manag_1.card_admin',
            )
            var list = ('' + roles).split(',')
            for (var i = 0; i < list.length; i++) {
                var role = list[i].trim()
                if (role && gs.hasRole(role)) {
                    full = true
                    break
                }
            }
        }

        this._full = full
        return full
    },

    /**
     * The bank_ids the current user is entitled to, from Bank Access.
     * Empty array means no entitlement -- callers must deny, not allow.
     */
    getBankIds: function () {
        if (this._banks !== null) {
            return this._banks
        }

        var banks = []
        var gr = new GlideRecord(this.T_BANK_ACCESS)
        gr.addQuery('user', gs.getUserID())
        gr.addQuery('active', true)
        gr.query()
        while (gr.next()) {
            var bank = gr.getValue('bank_id')
            if (bank && banks.indexOf(bank) === -1) {
                banks.push(bank)
            }
        }

        this._banks = banks
        return banks
    },

    /** Whether the current user may touch data belonging to a given bank. */
    canAccess: function (bankId) {
        if (!bankId) {
            return false
        }
        if (this.hasFullVisibility()) {
            return true
        }
        return this.getBankIds().indexOf('' + bankId) !== -1
    },

    /**
     * Adds the bank_id restriction to a query object (GlideRecord or
     * GlideAggregate). Used by both the query business rules and the provider.
     *
     * @return boolean true if the query may proceed, false if the user has no
     *                 entitlement at all (an impossible filter is applied so
     *                 the query is safe either way)
     */
    applyTo: function (queryObj) {
        if (this.hasFullVisibility()) {
            return true
        }

        var banks = this.getBankIds()
        if (!banks.length) {
            // Fail closed: impossible filter rather than no filter.
            queryObj.addQuery('bank_id', this.NO_ACCESS)
            return false
        }

        queryObj.addQuery('bank_id', 'IN', banks.join(','))
        return true
    },

    /** Diagnostic helper, handy when testing agents and portal users. */
    describe: function () {
        return {
            user: gs.getUserName(),
            full_visibility: this.hasFullVisibility(),
            bank_ids: this.hasFullVisibility() ? ['*'] : this.getBankIds(),
        }
    },

    type: 'CardPerimeter',
}
