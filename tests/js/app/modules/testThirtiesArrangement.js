// Copyright 2016 Endless Mobile, Inc.

const Gtk = imports.gi.Gtk;

const Minimal = imports.tests.minimal;
const MockWidgets = imports.tests.mockWidgets;
const ThirtiesArrangement = imports.app.modules.thirtiesArrangement;
const Utils = imports.tests.utils;

Gtk.init(null);

Minimal.test_arrangement_compliance(ThirtiesArrangement.ThirtiesArrangement);

describe('Thirties arrangement', function () {
    let arrangement;

    beforeEach(function () {
        arrangement = new ThirtiesArrangement.ThirtiesArrangement();
    });

    describe('sizing allocation', function () {
        let win;

        beforeEach(function () {
            for (let i = 0; i < 10; i++) {
                let card = new Minimal.MinimalCard();
                arrangement.add_card(card);
            }
            win = new Gtk.OffscreenWindow();
            win.add(arrangement);
            win.show_all();
        });

        afterEach(function () {
            win.destroy();
        });

        function testSizingArrangementForDimensions(arr_width, arr_height, max_rows, visible_children, child_width) {
            let message = 'handles arrangement for specified max_rows (' + max_rows +
                ') and dimensions' + ' (' + arr_width + 'x' + arr_height + ')';

            it (message, function () {
                arrangement.max_rows = max_rows;

                win.set_size_request(arr_width, arr_height);
                Utils.update_gui();

                arrangement.get_children().forEach((card, i) => {
                    if (i < visible_children) {
                        expect(card.get_allocation().width).toBe(child_width);
                        expect(card.get_child_visible()).toBe(true);
                    } else {
                        expect(card.get_child_visible()).toBe(false);
                    }
                });
            });
        }

        // At 2000x2000, max_rows=2, six cards should be visible and of width 400
        testSizingArrangementForDimensions(2000, 2000, 2, 6, 666);
        // At 1200x1200, and 1 max_rows, six cards should be visible and of width 400
        testSizingArrangementForDimensions(1200, 1200, 2, 6, 400);
        // At 1000x1000, max_rows=2, six cards should be visible; all cards of width 333
        testSizingArrangementForDimensions(1000, 1000, 2, 6, 333);
        // At 900x900, max_rows=2, six cards should be visible; all cards of width 300
        testSizingArrangementForDimensions(900, 900, 2, 6, 300);
        // At 800x600, max_rows=2, six cards should be visible; all cards of width 266
        testSizingArrangementForDimensions(800, 600, 2, 6, 266);
        // At 600x400, max_rows=2, six cards should be visible; all cards of width 200
        testSizingArrangementForDimensions(600, 400, 2, 6, 200);

        // With max_rows=1, three cards should be visible and of width 400
        testSizingArrangementForDimensions(1200, 1200, 1, 3, 400);
        // With max_rows=3, nine cards should be visible and of width 400
        testSizingArrangementForDimensions(1200, 1200, 3, 9, 400);
        // With max_rows=0, all ten cards should be visible; all cards of width 400
        testSizingArrangementForDimensions(1200, 1200, 0, 10, 400);
    });
});
