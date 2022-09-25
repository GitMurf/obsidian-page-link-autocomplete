import { PluginSettingTab, Setting } from 'obsidian';
import MyPlugin from './main';
import { MyPluginSettings } from './types';

export const DEFAULT_SETTINGS: MyPluginSettings = {
    saved: {
        settingsConfig: {
            autoSpace: false,
            secondaryTrigger: ';',
            getAlias: true,
        },
        data: {},
    },
    temp: {
        settingsConfig: {
            triggerChar: ' ',
            triggerCharSecondary: ';',
            triggerCharAllLinks: ',',
        },
        data: {
            curMdCacheLinks: [],
            fileLinks: [],
            curYaml: null,
            yamlLinks: [],
            yamlKVPairs: {},
            vaultLinks: [],
            linkMode: '',
            linkMatches: 0,
            trigCharMatch: ''
        },
    },
};

export class MySettingsTab extends PluginSettingTab {
    constructor(private plugin: MyPlugin) {
        super(plugin.app, plugin);
        this.plugin = plugin;
    }

    async display(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Page Link Autocomplete Settings' });

        containerEl.createEl('h3', { text: 'Core Settings' });
        // Spacebar trigger
        let newSetting = new Setting(containerEl);
        newSetting.setName('Auto Suggest Links with Spacebar');
        newSetting.setDesc('When enabled this plugin will suggest links after each word you type (if there is a match)');
        newSetting.addToggle(toggleComp => {
            toggleComp.setValue(this.plugin.settings.saved.settingsConfig.autoSpace);
            toggleComp.onChange(async (value) => {
                this.plugin.settings.saved.settingsConfig.autoSpace = value;
                if (value === true) {
                    this.plugin.settings.temp.settingsConfig.triggerChar = ' ';
                } else {
                    this.plugin.settings.temp.settingsConfig.triggerChar = '!null!';
                }
                await this.plugin.saveSettings();
            });
        });
        // Secondary suggest trigger
        newSetting = new Setting(containerEl);
        newSetting.setName('Secondary Suggest Trigger');
        newSetting.setDesc(
            createFragment(
                (innerFrag) => {
                    innerFrag.createEl('span', { text: 'Character that manually triggers the suggester' });
                    innerFrag.createEl('br');
                    innerFrag.createEl('strong', { text: 'Note:' });
                    innerFrag.createEl('span', { text: ' This can be used in addition to (or in place of) the Spacebar option above' });
                }
            )
        );
        newSetting.addText((text) => {
            text.setPlaceholder(';');
            text.setValue(this.plugin.settings.saved.settingsConfig.secondaryTrigger);
            text.onChange(async (value) => {
                this.plugin.settings.saved.settingsConfig.secondaryTrigger = value;
                this.plugin.settings.temp.settingsConfig.triggerCharSecondary = value;
                await this.plugin.saveSettings();
            })
        });
        newSetting.controlEl.querySelector('input').maxLength = 1;

        containerEl.createEl('h3', { text: 'User Preferences' });
        // Toggle 1
        newSetting = new Setting(containerEl);
        newSetting.setName('Toggle 1');
        newSetting.setDesc('Toggle 1 description...');
        newSetting.addToggle(toggleComp => {
            // toggleComp.setValue(this.plugin.settings.saved.settingsConfig.autoSpace);
            toggleComp.onChange(async (value) => {
                // this.plugin.settings.saved.settingsConfig.autoSpace = value;
                // await this.plugin.saveSettings();
            });
        });
        // Toggle 2
        newSetting = new Setting(containerEl);
        newSetting.setName('Toggle 2');
        newSetting.setDesc('Toggle 2 description...');
        newSetting.addToggle(toggleComp => {
            // toggleComp.setValue(this.plugin.settings.saved.settingsConfig.autoSpace);
            toggleComp.onChange(async (value) => {
                // this.plugin.settings.saved.settingsConfig.autoSpace = value;
                // await this.plugin.saveSettings();
            });
        });
        // Toggle 3
        newSetting = new Setting(containerEl);
        newSetting.setName('Toggle 3');
        newSetting.setDesc('Toggle 3 description...');
        newSetting.addToggle(toggleComp => {
            // toggleComp.setValue(this.plugin.settings.saved.settingsConfig.autoSpace);
            toggleComp.onChange(async (value) => {
                // this.plugin.settings.saved.settingsConfig.autoSpace = value;
                // await this.plugin.saveSettings();
            });
        });

        containerEl.createEl('h3', { text: 'User Configuration' });
        // Add things here like YAML keys to include in matching and maybe files / notes to always ignore (or something)

        containerEl.createEl('h4', { text: 'Other Stuff' });
        const funcParentDiv = containerEl.createDiv();
        funcParentDiv.createSpan({ text: 'Placeholder here for some other stuff...' });
        containerEl.createEl('br');
        containerEl.createEl('br');
    }
}
