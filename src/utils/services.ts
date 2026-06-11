import { GIST_FILE_NAME, LEGACY_GIST_FILE_NAMES } from './constants'
import { Setting } from './setting'
import { http } from './http'

type CreatedGist = {
    id?: string;
    public?: boolean;
    description?: string | null;
    files?: Record<string, {
        content?: string;
        truncated?: boolean;
        raw_url?: string;
    }>;
}

class BookmarkService {
    async createPrivateGist() {
        return http.post('gists', {
            json: {
                description: 'BookmarkHub--',
                public: false,
                files: {
                    [GIST_FILE_NAME]: {
                        content: JSON.stringify({
                            version: browser.runtime.getManifest().version,
                            createDate: Date.now(),
                            bookmarks: [],
                        }),
                    },
                },
            },
        }).json<CreatedGist>();
    }

    async testConnection() {
        const setting = await Setting.build();
        const gist = await this.getPrivateGist();
        const response = await http.patch(`gists/${setting.gistID}`, {
            json: {
                description: gist.description ?? '',
            },
        }).json<CreatedGist>();
        this.assertPrivate(response);
        return response;
    }

    async get() {
        const resp = await this.getPrivateGist();
        if (resp?.files) {
            const fileName = [GIST_FILE_NAME, ...LEGACY_GIST_FILE_NAMES]
                .find(name => resp.files[name] != null);
            if (fileName) {
                const gistFile = resp.files[fileName]
                if (gistFile.truncated) {
                    return http.get(gistFile.raw_url!, { prefix: '' }).text();
                } else {
                    return gistFile.content
                }
            }
        }
        return null;
    }
    async getAllGist() {
        return http.get('gists').json();
    }

    async update(data: any) {
        const setting = await Setting.build();
        await this.getPrivateGist();
        return http.patch(`gists/${setting.gistID}`, { json: data }).json();
    }

    private async getPrivateGist() {
        const setting = await Setting.build();
        const gist = await http.get(`gists/${setting.gistID}`).json<CreatedGist>();
        this.assertPrivate(gist);
        return gist;
    }

    private assertPrivate(gist: CreatedGist) {
        if (gist.public !== false) {
            throw new Error(browser.i18n.getMessage('gistMustBePrivate'));
        }
    }
}

export default new BookmarkService()
