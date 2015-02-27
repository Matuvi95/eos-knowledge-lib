const Cairo = imports.gi.cairo;  // note GI module, not native module
const Endless = imports.gi.Endless;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;

/**
 * Class: SpaceContainer
 * Container that shows only as many widgets as it has space for
 *
 * Usually a container will try to display all the widgets that have been added
 * to it.
 * You can add as many widgets as you want to *SpaceContainer*, but it will only
 * show as many as it has space for.
 * If you resize your window so that there is space for more widgets, they will
 * appear.
 *
 * Parent class:
 *   *Endless.CustomContainer*
 */
const SpaceContainer = new Lang.Class({
    Name: 'SpaceContainer',
    GTypeName: 'EknSpaceContainer',
    Extends: Endless.CustomContainer,
    Implements: [Gtk.Orientable],
    Properties: {
        /**
         * Property: orientation
         * Implemented from **Gtk.Orientable**
         */
        'orientation': GObject.ParamSpec.enum('orientation', 'override', 'override',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT,
            Gtk.Orientation.$gtype, Gtk.Orientation.VERTICAL),
        /**
         * Property: spacing
         * The amount of space between children
         *
         * Default:
         *   0
         */
        'spacing': GObject.ParamSpec.uint('spacing', 'Spacing',
            'The amount of space between children',
            GObject.ParamFlags.READWRITE,
            0, GLib.MAXUINT16, 0),
        /**
         * Property: all-visible
         * Whether all children are visible or some were cut off
         *
         * Flags:
         *   read-only
         */
        'all-visible': GObject.ParamSpec.boolean('all-visible', 'All visible',
            'All children visible',
            GObject.ParamFlags.READABLE,
            true),
    },

    _init: function (props={}) {
        this._all_fit = true;
        this._spacing = 0;
        this.parent(props);
    },

    get spacing() {
        return this._spacing;
    },

    set spacing(value) {
        if (this._spacing === value)
            return;
        this._spacing = value;
        this.notify('spacing');
        this.queue_resize();
    },

    get all_visible() {
        return this._all_fit;
    },

    _get_visible_children: function () {
        // Reverse the children because CustomContainer prepends children to its list.
        return this.get_children().reverse().filter((child) => child.visible);
    },

    // The secondary dimension (i.e., width if orientation == VERTICAL) is the
    // maximum minimal and natural secondary dimensions of any one child, even
    // including ones that are not shown.
    _get_preferred_secondary: function (secondary) {
        let children = this.get_children();
        if (children.length === 0)
            return [0, 0];
        return children.reduce((accum, child) => {
            let [min, nat] = accum;
            let [child_min, child_nat] = child['get_preferred_' + secondary]();
            return [Math.max(child_min, min), Math.max(child_nat, nat)];
        }, [0, 0]);
    },

    // The primary dimension is height if orientation == VERTICAL, for example.
    // Preferred minimal primary dimension is the minimal primary dimension of
    // the first child, since the widget can shrink down to one child; preferred
    // natural primary dimension is the combined natural primary dimension of
    // all children, since given enough space we would display all of them.
    _get_preferred_primary: function (primary) {
        let children = this._get_visible_children();
        if (children.length === 0)
            return [0, 0];
        let primary_getter = 'get_preferred_' + primary;
        let [min, nat] = children[0][primary_getter]();
        nat += children.slice(1).reduce((accum, child) => {
            let [child_min, child_nat] = child[primary_getter]();
            return accum + child_nat + this._spacing;
        }, 0);
        return [min, nat];
    },

    _get_shown_children_info: function (children, primary, available_space) {
        let cum_min_size = 0;
        let shown_children_info = [];
        let ran_out_of_space = false;
        // Determine how many children will fit in the available space.
        children.forEach((child, ix) => {
            let [child_min, child_nat] = child['get_preferred_' + primary]();
            cum_min_size += child_min;
            if (ix > 0)
                cum_min_size += this._spacing;
            if (!ran_out_of_space && cum_min_size <= available_space) {
                shown_children_info.push({
                    minimum: child_min,
                    natural: child_nat,
                    child: child,
                });
                child.set_child_visible(true);
            } else {
                child.set_child_visible(false);
                // If #3 won't fit, then #4 shouldn't be shown even if it fits.
                ran_out_of_space = true;
            }
        });
        if (ran_out_of_space === this._all_fit) {
            this._all_fit = !ran_out_of_space;
            this.notify('all-visible');
        }
        return shown_children_info;
    },

    _allocate_primary_space: function (shown_children_info, available_space) {
        // Start by giving each visible child its minimum height.
        let allocated_sizes = shown_children_info.map((info) => info.minimum);
        let extra_space = available_space -
            (shown_children_info.length - 1) * this._spacing -
            _sum(allocated_sizes);

        // If there is extra space, give each visible child more height up to
        // its natural height.
        if (extra_space > 0) {
            let requested_diff = allocated_sizes.map((size, ix) =>
                shown_children_info[ix].natural - size);
            let space_for_all_naturals = _sum(requested_diff);
            // If possible, give every child its natural height, otherwise give
            // each child a fair proportion of its natural height.
            let proportion = (space_for_all_naturals <= extra_space) ? 1.0 :
                extra_space / space_for_all_naturals;
            requested_diff.forEach((diff, ix) => {
                let adjustment = Math.round(diff * proportion);
                allocated_sizes[ix] += adjustment;
                extra_space -= adjustment;
            });
        }

        // If there is still extra space, divide it between any widgets that
        // are effectively expanded.
        if (extra_space > 0) {
            let num_expanded = 0;
            let expanded = shown_children_info.map((info) => {
                let expand = info.child.compute_expand(this.orientation);
                if (expand)
                    num_expanded++;
                return expand;
            });
            if (num_expanded > 0) {
                let extra_allotment = Math.round(extra_space / num_expanded);
                expanded.forEach((expand, ix) => {
                    if (expand) {
                        allocated_sizes[ix] += extra_allotment;
                        extra_space -= extra_allotment;
                    }
                });
            }
        }
        // If any extra space after that, just don't use it.

        return allocated_sizes;
    },

    vfunc_get_preferred_width: function () {
        if (this.orientation === Gtk.Orientation.VERTICAL)
            return this._get_preferred_secondary('width');
        return this._get_preferred_primary('width');
    },

    vfunc_get_preferred_height: function () {
        if (this.orientation === Gtk.Orientation.VERTICAL)
            return this._get_preferred_primary('height');
        return this._get_preferred_secondary('height');
    },

    vfunc_size_allocate: function (allocation) {
        this.parent(allocation);

        let children = this._get_visible_children();
        if (children.length === 0)
            return;

        let primary, secondary, primary_pos, secondary_pos;
        if (this.orientation === Gtk.Orientation.VERTICAL) {
            primary = 'height';
            secondary = 'width';
            primary_pos = 'y';
            secondary_pos = 'x';
        } else {
            primary = 'width';
            secondary = 'height';
            primary_pos = 'x';
            secondary_pos = 'y';
        }

        let shown_children_info = this._get_shown_children_info(children,
            primary, allocation[primary]);
        if (shown_children_info.length === 0)
            return;  // No widgets fit, nothing to do.

        let allocated_primary_sizes = this._allocate_primary_space(shown_children_info,
            allocation[primary]);

        // Calculate the positions of the widgets, taking into account the
        // spacing; one widget begins where the previous widget ends, plus the
        // spacing.
        let cum_primary_sizes = _cumsum(allocated_primary_sizes.map((size) =>
            size + this._spacing));
        let cum_rel_positions = cum_primary_sizes.slice();
        cum_rel_positions.unshift(0);

        shown_children_info.forEach((info, ix) => {
            let props = {};
            props[primary] = allocated_primary_sizes[ix];
            props[secondary] = allocation[secondary];
            props[primary_pos] = allocation[primary_pos] + cum_rel_positions[ix];
            props[secondary_pos] = allocation[secondary_pos];
            let rect = new Cairo.RectangleInt(props);
            info.child.size_allocate(rect);
        });
    },

    vfunc_remove: function (child) {
        this.parent(child);
        if (child.visible)
            this.queue_resize();
    },
});

function _sum(array) {
    return array.reduce((total, val) => total + val, 0);
}

function _cumsum(array) {
    let retval = [];
    array.reduce((total, val, ix) => {
        total += val;
        retval[ix] = total;
        return total;
    }, 0);
    return retval;
}
