// Copyright 2016 Endless Mobile, Inc.

const Eknc = imports.gi.EosKnowledgeContent;
const EosShard = imports.gi.EosShard;
const Format = imports.format;
const Json = imports.gi.Json;
const Gio = imports.gi.Gio;
const Lang = imports.lang;

const AsyncTask = imports.search.asyncTask;
const Utils = imports.search.utils;

// This hash is derived from sha1('link-table'), and for now is the hardcoded
// location of link tables for all shards.
const LINK_TABLE_ID = '4dba9091495e8f277893e0d400e9e092f9f6f551';

/**
 * Class: Domain
 */
const Domain = new Lang.Class({
    Name: 'Domain',

    _init: function (app_id, xapian_bridge) {
        this._app_id = app_id;
        this._xapian_bridge = xapian_bridge;

        this._content_dir = null;

        this._load_sync();
    },

    _get_content_dir: function () {
        if (this._content_dir === null)
            this._content_dir = Eknc.get_data_dir(this._app_id);

        return this._content_dir;
    },

    // Gets the parameters to pass to the Xapian Bridge for this domain.
    // The domain *must* be loaded before calling!
    _get_domain_query_params: function () {
        let params = {};
        params.manifest_path = this._get_manifest_file().get_path();
        return params;
    },

    _get_subscription_entry: function () {
        if (this._subscription_entry === undefined) {
            let entries = Utils.get_subscription_entries(this._app_id);

            // XXX: For now, we only support the first subscription.
            this._subscription_entry = entries[0];
        }

        return this._subscription_entry;
    },

    _get_subscription_id: function () {
        return this._get_subscription_entry().id;
    },

    _get_subscription_dir: function () {
        if (this._subscription_dir === undefined) {
            let subscription_id = this._get_subscription_id();
            let subscriptions_dir = Utils.get_subscriptions_dir();
            this._subscription_dir = subscriptions_dir.get_child(subscription_id);
            Utils.ensure_directory(this._subscription_dir);
        }

        return this._subscription_dir;
    },

    _get_manifest_file: function () {
        let subscription_dir = this._get_subscription_dir();
        let manifest_file = subscription_dir.get_child('manifest.json');
        return manifest_file;
    },

    _clean_up_old_symlinks: function (subscription_dir, cancellable) {
        let file_enum = subscription_dir.enumerate_children('standard::name,standard::type',
                                                            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);

        let info;
        while ((info = file_enum.next_file(cancellable))) {
            let file = file_enum.get_child(info);
            if (!file.query_exists(cancellable))
                file.delete(cancellable);
        }
    },

    _get_bundle_dir: function () {
        let subscription_id = this._get_subscription_id();
        let content_dir = this._get_content_dir();
        let bundle_dir = content_dir.get_child('com.endlessm.subscriptions').get_child(subscription_id);
        return bundle_dir;
    },

    _make_bundle_symlinks: function (cancellable) {
        // In order to bootstrap content inside bundles while still keeping one subscriptions
        // directory, we symlink shards from the content bundle into the subscription directory.

        let bundle_dir = this._get_bundle_dir();
        let subscription_dir = this._get_subscription_dir();

        this._clean_up_old_symlinks(subscription_dir, cancellable);

        let manifest_file = this._get_manifest_file();
        let [success, data] = manifest_file.load_contents(cancellable);
        let manifest = JSON.parse(data);

        manifest.shards.forEach((shard_entry) => {
            let bundle_shard_file = bundle_dir.get_child(shard_entry.path);
            if (!bundle_shard_file.query_exists(cancellable))
                return;

            let subscription_shard_file = subscription_dir.get_child(shard_entry.path);

            try {
                // Symlink into the subscriptions dir.
                subscription_shard_file.make_symbolic_link(bundle_shard_file.get_path(), cancellable);
            } catch (e if e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
                // Shard already exists, we're good.
            }
        });
    },

    _load_record_from_hash_sync: function (hash) {
        for (let i = 0; i < this._shards.length; i++) {
            let shard_file = this._shards[i];
            let record = shard_file.find_record_by_hex_name(hash);
            if (record)
                return record;
        }

        return null;
    },

    get_shards: function (cancellable=null) {
        return this._shards;
    },

    // We don't resolve links using the usual load() pattern because this
    // method needs to be synchronous, but we're guaranteed that all shards are
    // initialized by the time this is invoked by the HTML renderer.
    _setup_link_tables: function () {
        // Ignore if we've already setup our tables
        if (this._link_tables !== undefined)
            return;

        let tables = this._shards.map((shard) => {
            let table_record = shard.find_record_by_hex_name(LINK_TABLE_ID);
            if (table_record) {
                return table_record.data.load_as_dictionary();
            } else {
                return null;
            }
        });

        // Filter out invalid tables
        this._link_tables = tables.filter((t) => t);
    },

    _load_sync: function () {
        let manifest_file = this._get_manifest_file();

        // If the manifest.json doesn't exist, and we have a manifest in the bundle, symlink
        // to it to bootstrap our subscription.
        if (!manifest_file.query_exists(null)) {
            let bundle_dir = this._get_bundle_dir();
            let bundle_manifest_file = bundle_dir.get_child('manifest.json');
            if (bundle_manifest_file.query_exists(null)) {
                manifest_file.make_symbolic_link(bundle_manifest_file.get_path(), null);
            } else {
                throw new Gio.IOErrorEnum({
                    message: 'You have no manifest.json and are not ' +
                        'running from a Flatpak bundle. You must download' +
                        ' a content update.',
                    code: Gio.IOErrorEnum.NOT_FOUND,
                });
            }
        }

        this._make_bundle_symlinks(null);

        let [success, data] = manifest_file.load_contents(null);
        let manifest = JSON.parse(data);

        let subscription_dir = this._get_subscription_dir();
        this._shards = manifest.shards.map(function(shard_entry) {
            let file = subscription_dir.get_child(shard_entry.path);
            return new EosShard.ShardFile({
                path: file.get_path(),
            });
        });

        // Don't allow init() to be cancelled; otherwise,
        // cancellation will spoil the object for future use.
        Eknc.utils_parallel_init(this._shards, 0, null);

        // Fetch the link table dictionaries from each shard for link lookups
        this._setup_link_tables();
    },

    /**
     * Function: test_link
     *
     * Attempts to determine if the given link corresponds to content within
     * this domain. Returns an EKN URI to that content if so, and false
     * otherwise.
     */
    test_link: function (link) {
        for (let table of this._link_tables) {
            let result = table.lookup_key(link);
            if (result !== null)
                return result;
        }
        return false;
    },

    get_object: function (id, cancellable, callback) {
        let task = new AsyncTask.AsyncTask(this, cancellable, callback);
        task.catch_errors(() => {
            let [hash] = Utils.components_from_ekn_id(id);
            let record = this._load_record_from_hash_sync(hash);
            let metadata_stream = record.metadata.get_stream();
            Utils.read_stream(metadata_stream, cancellable, task.catch_callback_errors((stream, stream_task) => {
                let data = Utils.read_stream_finish(stream_task);
                let node = Json.from_string(data);
                task.return_value(Eknc.object_model_from_json_node(node));
            }));
        });
        return task;
    },

    get_object_finish: function (task) {
        return task.finish();
    },

    /**
     * Function: get_fixed_query
     *
     * Asynchronously sends a request for to xapian-bridge to correct a given
     * query object. The corrections can be zero or more of the following:
     *      - the query with its stop words removed
     *      - the query which has had spelling correction applied to it.
     *
     * Note that the spelling correction will be performed on the original
     * query string, and not the string with stop words removed.
     *
     * Parameters:
     *   query_obj - A <QueryObject> describing the query.
     *   cancellable - A Gio.Cancellable to cancel the async request.
     *   callback - A function which will be called after the request finished.
     *              The function will be called with the engine and a task object,
     *              as parameters. The task object can be used with
     *              <get_fixed_query_finish> to retrieve the result.
     */
    get_fixed_query: function (query_obj, cancellable, callback) {
        let task = new AsyncTask.AsyncTask(this, cancellable, callback);

        task.catch_errors(() => {
            let domain_params = this._get_domain_query_params();
            this._xapian_bridge.get_fixed_query(query_obj, domain_params, cancellable, task.catch_callback_errors((bridge, bridge_task) => {
                let result = this._xapian_bridge.get_fixed_query_finish(bridge_task);
                task.return_value(result);
            }));
        });

        return task;
    },

    /**
     * Function: get_fixed_query_finish
     *
     * Finishes a call to <get_fixed_query>. Returns a query object with the
     * corrections applied. Throws an error if one occurred.
     *
     * Parameters:
     *   task - The task returned by <get_fixed_query>
     */
    get_fixed_query_finish: function (task) {
        return task.finish();
    },

    get_objects_for_query: function (query_obj, cancellable, callback) {
        let task = new AsyncTask.AsyncTask(this, cancellable, callback);
        task.catch_errors(() => {
            let domain_params = this._get_domain_query_params();
            this._xapian_bridge.query(query_obj, domain_params, cancellable, task.catch_callback_errors((bridge, query_task) => {
                let json_node = this._xapian_bridge.query_finish(query_task);
                let json_ld = JSON.parse(Json.to_string(json_node, false));

                if (json_ld.results.length === 0) {
                    task.return_value([[], {}]);
                    return;
                }

                let info = {};
                Object.defineProperty(info, 'upper_bound', {
                    value: json_ld['upperBound'] || 0,
                });

                AsyncTask.all(this, (add_task) => {
                    json_ld.results.forEach((result) => {
                        add_task((cancellable, callback) => this.get_object(result, cancellable, callback),
                                 (task) => this.get_object_finish(task));
                    });
                }, cancellable, task.catch_callback_errors((source, resolve_task) => {
                    let results = AsyncTask.all_finish(resolve_task);
                    task.return_value([results, info]);
                }));
            }));
        });
        return task;
    },

    get_objects_for_query_finish: function (task) {
        return task.finish();
    },
});

/**
 * Function: get_domain_impl
 *
 * Gets a domain object for a given app id. Currently only EKN_VERSION 3 domains
 * are supported, but we may bring back multiple version of our on disk database
 * format in the future.
 *
 * You should only get a domain object _after_ applying any pending
 * updates. Once this object is created, you should not make any
 * modifications to the subscription manifest or the shards referenced
 * by it.
 */
function get_domain_impl (app_id, xapian_bridge) {
    let ekn_version = Utils.get_ekn_version(app_id);

    let impls = {
        '3': Domain,
    };

    let impl = impls[ekn_version];
    if (!impl)
        throw new Error(Format.vprintf('Invalid ekn version for app ID %s: %s', [app_id, ekn_version]));

    return new impl(app_id, xapian_bridge);
}
