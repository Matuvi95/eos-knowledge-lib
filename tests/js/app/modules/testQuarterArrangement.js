// Copyright 2016 Endless Mobile, Inc.

const Gtk = imports.gi.Gtk;

const Minimal = imports.tests.minimal;
const QuarterArrangement = imports.app.modules.quarterArrangement;
const Utils = imports.tests.utils;

Gtk.init(null);

Minimal.test_arrangement_compliance(QuarterArrangement.QuarterArrangement);

describe('Quarter Arrangement', function () {
    let arrangement, win;

    beforeEach(function () {
        arrangement = new QuarterArrangement.QuarterArrangement();

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

    describe('sizing allocation', function () {
        function testSizingArrangementForDimensions(arrangement_size, featured_cards_per_row, support_cards_per_row) {
            it('handles arrangement with width=' + arrangement_size, function () {
                win.set_size_request(arrangement_size, arrangement_size);
                win.show_all();

                win.queue_resize();
                Utils.update_gui();

                let all_cards = arrangement.get_cards();

                let featured_card_width = Math.floor(arrangement_size / featured_cards_per_row);
                let support_card_width = Math.floor(arrangement_size / support_cards_per_row);
                // Test featured cards
                all_cards.slice(0, featured_cards_per_row).forEach((card) => {
                    expect(card.get_allocation().width).toBe(featured_card_width);
                    expect(card.get_child_visible()).toBe(true);
                });

                // Test support cards
                all_cards.slice(featured_cards_per_row, all_cards.length).forEach((card) => {
                    expect(card.get_allocation().width).toBe(support_card_width);
                    expect(card.get_child_visible()).toBe(true);
                });
            });
        }

        // At width=2000px, arrangement shows four featured cards and rows of three support cards
        testSizingArrangementForDimensions(2000, 4, 3);
        // At width=1200px, arrangement shows four featured cards and rows of three support cards
        testSizingArrangementForDimensions(1200, 4, 3);
        // At width=900px, arrangement shows three featured cards and rows of two support cards
        testSizingArrangementForDimensions(900, 3, 2);
        // At width=800px, arrangement shows two featured cards and rows of two support cards
        testSizingArrangementForDimensions(720, 2, 2);
        // At width=800px, arrangement shows two featured cards and rows of two support cards
        testSizingArrangementForDimensions(640, 2, 2);
    });
});