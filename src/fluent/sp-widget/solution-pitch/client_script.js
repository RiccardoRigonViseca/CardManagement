api.controller = function () {
    var c = this;

    c.sections = [
        { id: 'hook', label: 'The idea' },
        { id: 'problem', label: 'Today' },
        { id: 'architecture', label: 'Architecture' },
        { id: 'safety', label: 'Why it is safe' },
        { id: 'approval', label: 'Human control' },
        { id: 'isolation', label: 'Isolation' },
        { id: 'decoupling', label: 'API-ready' },
        { id: 'live', label: 'Running now' }
    ];

    c.index = 0;

    c.current = function () {
        return c.sections[c.index];
    };

    c.isOn = function (id) {
        return c.sections[c.index].id === id;
    };

    c.goTo = function (i) {
        if (i < 0 || i >= c.sections.length) {
            return;
        }
        c.index = i;
    };

    c.next = function () {
        if (c.index < c.sections.length - 1) {
            c.index++;
        }
    };

    c.prev = function () {
        if (c.index > 0) {
            c.index--;
        }
    };

    c.isFirst = function () {
        return c.index === 0;
    };

    c.isLast = function () {
        return c.index === c.sections.length - 1;
    };

    c.progressPercent = function () {
        return Math.round(((c.index + 1) / c.sections.length) * 100);
    };

    c.onKeydown = function (event) {
        if (event.keyCode === 39 || event.keyCode === 32) {
            event.preventDefault();
            c.next();
        } else if (event.keyCode === 37) {
            event.preventDefault();
            c.prev();
        } else if (event.keyCode === 36) {
            event.preventDefault();
            c.goTo(0);
        } else if (event.keyCode === 35) {
            event.preventDefault();
            c.goTo(c.sections.length - 1);
        }
    };

    c.refusedCount = function () {
        var list = c.data.outcomes || [];
        var found = 0;
        list.forEach(function (o) {
            if (o.key === 'refused') {
                found = o.count;
            }
        });
        return found;
    };

    c.outcomeWidth = function (value) {
        var list = c.data.outcomes || [];
        var top = 0;
        list.forEach(function (o) {
            if (o.count > top) {
                top = o.count;
            }
        });
        if (!top) {
            return 0;
        }
        return Math.max(4, Math.round((value / top) * 100));
    };

    c.assistantUrl = function () {
        return '?id=' + (c.data.assistantPageId || 'x_snc_card_manag_1_assistant');
    };
};
