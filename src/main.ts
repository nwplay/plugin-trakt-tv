import {Browser, Extension, Platform, Player, PluginButtonSetting, PluginSetting, TvEpisode} from '@nwplay/core';

const CLIENT_ID = '851f82e89eeab561acd316de94e667b34b13f62f8eb5ba08936ffa349de18c3d';
const CLIENT_SECRET = 'e04a5b8bf0a27fa566fd6f65c4acfc32100eb7f4923c53278692706757d34093';

export class TraktTv extends Extension {
    settings = []
    private tokenData: any;

    async init(): Promise<void> {
        try {
            this.tokenData = JSON.parse(localStorage['TRAKT_TOKEN']);
        } catch (e) {
        }
        if (!localStorage['TRAKT_FIRST_RUN'] && !this.tokenData) {
            localStorage['TRAKT_FIRST_RUN'] = 1;
            this.login();
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
    }

    private getScrobbleRequest() {
        const item = Player.default.currentItem;
        if (item instanceof TvEpisode) {
            return {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + this.tokenData.access_token,
                    'trakt-api-version': '2',
                    'trakt-api-key': CLIENT_ID
                },
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
}
