import {
    Browser,
    Extension,
    History,
    IGetWatchlistItemsOptions,
    Platform,
    Player,
    PluginButtonSetting,
    PluginSetting,
    providers,
    SearchResult,
    TvEpisode,
    TvSeason,
    TvShow,
    Watchlist,
    WatchlistItem
} from '@nwplay/core';

const CLIENT_ID = '851f82e89eeab561acd316de94e667b34b13f62f8eb5ba08936ffa349de18c3d';
const CLIENT_SECRET = 'e04a5b8bf0a27fa566fd6f65c4acfc32100eb7f4923c53278692706757d34093';

export class TraktTv extends Extension {
    settings = []
    private tokenData: any;
    private prog: any[] = [];
    private tids = new Map<any, string>();
    private hids = new Map<any, Promise<any>>();


    async onMediaItem(item) {
        if (!this.tokenData) {
            return
        }
        if (item instanceof TvShow) {

        } else if (item instanceof TvEpisode) {
            const season = (item.parent as TvSeason);
            const h = await this.loadTvHistory(season.parent);
            const traktId = await this.getTraktIdFromTvShow(season.parent);
            const p = this.prog.find(e =>
                e.show.ids.trakt === traktId &&
                e.episode.number === item.episode &&
                e.episode.season === season.season
            );
            if (p) {
                History.default.setProgress(item, p.progress / 100, false);
                return;
            }
            const c = h.find(e =>
                e.show.ids.trakt === traktId &&
                e.episode.number === item.episode &&
                e.episode.season === season.season
            );
            if (c) {
                History.default.setProgress(item, 1, false);
            }
        }
    }

    async syncTvProgress() {
        this.prog = await Platform.default.fetch('https://api.trakt.tv/sync/playback/episodes', {
            method: 'get',
            headers: {
                ...this.getTrakHeaders()
            }
        }).then(e => e.json());
    }

    async loadTvHistory(show: TvShow) {
        if (this.hids.has(show.id)) {
            return await this.hids.get(show.id)
        }
        const r = this._loadTvHistory(show);
        this.hids.set(show.id, r);
        return await r;
    }

    async loadDeck(items: any[]) {

    }

    async _loadTvHistory(show: TvShow) {
        const traktId = await this.getTraktIdFromTvShow(show);
        if (!traktId) {
            return;
        }
        const r = await Platform.default.fetch('https://api.trakt.tv/sync/history/shows/' + traktId + '?limit=500', {
            method: 'get',
            headers: {
                ...this.getTrakHeaders()
            }
        }).then(e => e.json());
        this.loadDeck(r).catch(console.error);
        return r;
    }

    public async getTraktIdFromTvShow(show: TvShow): Promise<string> {
        if (this.tids.has(show.id)) {
            return this.tids.get(show.id)
        }
        const url = `https://api.trakt.tv/search/show?query=${encodeURIComponent(show.title)}`;
        const res: any[] = await Platform.default.fetch(url, {
            method: 'get',
            headers: this.getTrakHeaders()
        }).then(e => e.json());
        if (res.length === 0) {
            return null;
        }
        this.tids.set(show.id, res[0].show.ids.trakt);
        return res[0].show.ids.trakt;
    }

    async init(): Promise<void> {
        try {
            this.tokenData = JSON.parse(localStorage['TRAKT_TOKEN']);
        } catch (e) {
        }
        if (!localStorage['TRAKT_FIRST_RUN'] && !this.tokenData) {
            localStorage['TRAKT_FIRST_RUN'] = 1;
            this.login().catch(e => console.log(e));
        }

        Player.default.onPlay.subscribe(() => {
            const req = this.getScrobbleRequest();
            if (req) {
                Platform.default.fetch('https://api.trakt.tv/scrobble/start', req)
            }
        });
        Player.default.onSeek.subscribe(() => {
            const req = this.getScrobbleRequest();
            if (req) {
                Platform.default.fetch('https://api.trakt.tv/scrobble/start', req)
            }
        });
        Player.default.onPause.subscribe(() => {
            const req = this.getScrobbleRequest();
            if (req) {
                Platform.default.fetch('https://api.trakt.tv/scrobble/pause', req)
            }
        });

        Player.default.onStop.subscribe(() => {
            const req = this.getScrobbleRequest();
            if (req) {
                Platform.default.fetch('https://api.trakt.tv/scrobble/stop', req)
            }
        });
        this.updateSettings();

        Watchlist.default.onAddItem.subscribe(async (item) => {
            const res = await Platform.default.fetch('https://api.trakt.tv/sync/watchlist', {
                method: 'post',
                body: JSON.stringify({
                    shows: [
                        {
                            title: item.title
                        }
                    ]
                }),
                headers: this.getTrakHeaders()
            }).then(e => e.json());
        });

        Watchlist.default.onRemoveItem.subscribe(async (item) => {
            const id = item.data['trakt_id'];
            const type = item.data['trakt_type'];
            if (!id) {
                return;
            }
            const res = await Platform.default.fetch('https://api.trakt.tv/sync/watchlist/remove', {
                method: 'post',
                body: JSON.stringify({
                    [`${type}s`]: [
                        {
                            ids: {
                                trakt: id
                            }
                        }
                    ]
                }),
                headers: this.getTrakHeaders()
            }).then(e => e.json());
        });

        /*History.default.onProgressChanged.subscribe(async (p) => {
            if(p.progress === 1 || p.progress === 0) {
                await Platform.default.fetch('https://api.trakt.tv/sync/history', {
                    method: 'post',
                    body: JSON.stringify({
                        episodes: [
                            {
                                watched_at: new Date(),
                                ids: {

                                }
                            }
                        ]
                    }),
                    headers: this.getTrakHeaders()
                }).then(e => e.json());
            }
        })*/

        setTimeout(async () => {
            await this.loadWatchlist({skip: 0, take: 100});
            await this.syncTvProgress();
        }, 10000);


    }

    private getTrakHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.tokenData.access_token,
            'trakt-api-version': '2',
            'trakt-api-key': CLIENT_ID
        };
    }

    private getScrobbleRequest() {
        const item = Player.default.currentItem;
        if (item instanceof TvEpisode) {
            return {
                headers: this.getTrakHeaders(),
                method: 'post',
                body: JSON.stringify({
                    "show": {
                        "title": item.parent.parent.title,
                        ...(item.parent.parent.year ? {year: item.parent.parent.year} : {}),
                        "ids": {}
                    },
                    "episode": {
                        "season": item.parent.season,
                        "number": item.episode
                    },
                    "progress": (100 / Player.default.duration) * Player.default.currentTime,
                    "app_version": "1.0",
                    "app_date": "2020-06-22"
                })
            }
        } else {
            return null;
        }
    }

    private async fetchAuth(d: any): Promise<boolean> {
        try {
            const res = await Platform.default.fetch('https://api.trakt.tv/oauth/device/token', {
                method: 'post',
                body: JSON.stringify({
                    "code": d.device_code,
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET
                }),
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(e => e.json());
            this.tokenData = res;
            localStorage['TRAKT_TOKEN'] = JSON.stringify(res);
            return true;
        } catch (e) {
        }
        return false;
    }

    private async login() {
        const res = await Platform.default.fetch('https://api.trakt.tv/oauth/device/code', {
            method: 'post',
            body: JSON.stringify({
                "client_id": CLIENT_ID
            }),
            headers: {
                'Content-Type': 'application/json'
            },
        }).then(e => e.json());
        let browser = new Browser(res.verification_url, {
            partition: 'TRAKT'
        });
        browser.show();
        setInterval(() => {
            browser.getHtml().then(e => {
                if (e.includes('Enter the code displayed on your device')) {
                    browser.executeScript(`document.querySelector('#code').value = '${res.user_code}'`);
                }
            })
        }, 750);
        const interval = setInterval(() => {
            this.fetchAuth(res).then((suc) => {
                if (suc) {
                    clearInterval(interval);
                    if (browser) {
                        browser.close();
                        browser = null;
                    }
                    this.updateSettings();
                }
            });
        }, res.interval * 1000);

        setTimeout(() => {
            clearInterval(interval);
            if (browser) {
                browser.close();
                browser = null;
            }
        }, res.expires_in * 1000);
    }

    private updateSettings() {
        const settings: PluginSetting[] = [];
        if (this.tokenData) {
            settings.push(new PluginButtonSetting({
                label: 'Logout', click: () => {
                    this.tokenData = null;
                    delete localStorage['TRAKT_TOKEN'];
                    this.updateSettings();
                }
            }));
        } else {
            settings.push(new PluginButtonSetting({
                label: 'Login', click: () => {
                    this.login();
                }
            }));
        }
        this.settings = settings;
    }

    async loadWatchlist(opts: IGetWatchlistItemsOptions): Promise<SearchResult[]> {
        const res = await Platform.default.fetch('https://api.trakt.tv/sync/watchlist/shows/added', {
            method: 'get',
            headers: this.getTrakHeaders()
        }).then(e => e.json());
        const searchableProviders = providers.filter(e => e.search);
        const items: WatchlistItem[] = [];
        const oldTraktItems: WatchlistItem[] = [];
        Watchlist.default.items = Watchlist.default.items.filter(e => {
            if (e.data['trakt_id']) {
                oldTraktItems.push(e);
                return false;
            }

            return true;
        });
        for (const sr of res) {
            if (sr.show) {
                const old = oldTraktItems.find(e => e.data['trakt_id'] === sr.show.ids.trakt);
                if (old) {
                    await Watchlist.default.addItem(old, false);
                    continue;
                }
                for (const prov of searchableProviders) {
                    const res = await prov.search({
                        query: sr.show.title,
                        offset: 0,
                        take: 1
                    });
                    if (res.length > 0) {
                        const item = await Watchlist.default.addItem(res[0], false);
                        item.data['trakt_id'] = sr.show.ids.trakt;
                        item.data['trakt_type'] = sr.type;
                        break;
                    }
                }
            }

        }
        await Watchlist.default.save();
        return items;
    }
}
