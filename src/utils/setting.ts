import { Options } from 'webext-options-sync';
import optionsStorage from './optionsStorage'

export class SettingBase implements Options {
    constructor() { }
    [key: string]: string | number | boolean;
    githubToken: string = '';
    gistID: string = '';
    enableNotify: boolean = true;
}

export class Setting extends SettingBase {
    private constructor() { super() }

    static async build() {
        const options = await optionsStorage.getAll();
        const setting = new Setting();
        setting.gistID = options.gistID;
        setting.githubToken = options.githubToken;
        setting.enableNotify = options.enableNotify;
        return setting;
    }
}
