// Copyright 2016 Endless Mobile, Inc.

const AlphabeticalOrder = imports.app.modules.alphabeticalOrder;
const ContentObjectModel = imports.search.contentObjectModel;

describe('Alphabetical order', function () {
    let order, models;

    const UNSORTED_TITLES = ['Frilled shark', 'Goldfish', 'Squid',
        'Pistol shrimp', 'Jellyfish', 'Ocelot', 'Aardvark', 'Fruit bat',
        'Kangaroo'];
    const SORTED_TITLES = ['Aardvark', 'Frilled shark', 'Fruit bat', 'Goldfish',
        'Jellyfish', 'Kangaroo', 'Ocelot', 'Pistol shrimp', 'Squid'];

    beforeEach(function () {
        models = UNSORTED_TITLES.map(title =>
            new ContentObjectModel.ContentObjectModel({ title: title }));
    });

    describe('ascending', function () {
        beforeEach(function () {
            order = new AlphabeticalOrder.AlphabeticalOrder();
        });

        it('is the default', function () {
            expect(order.ascending).toBeTruthy();
        });

        it('sorts models by title', function () {
            expect(models.sort(order.compare.bind(order))
                .map(model => model.title)).toEqual(SORTED_TITLES);
        });
    });

    describe('descending', function () {
        beforeEach(function () {
            order = new AlphabeticalOrder.AlphabeticalOrder({
                ascending: false,
            });
        });

        it('sorts models by title', function () {
            expect(models.sort(order.compare.bind(order))
                .map(model => model.title)).toEqual(SORTED_TITLES.reverse());
        });
    });
});