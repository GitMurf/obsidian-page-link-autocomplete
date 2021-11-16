import { App, Editor, Plugin, PluginSettingTab, Setting, EditorSuggest, EditorPosition, TFile, EditorSuggestTriggerInfo, EditorSuggestContext, LinkCache } from 'obsidian';
declare module "obsidian" {
    interface WorkspaceLeaf {
        containerEl: HTMLElement;
    }
}
const pluginName = 'Page Link Autocomplete';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
    mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: 'default'
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        console.log("loading plugin: " + pluginName);
        await this.loadSettings();
        this.registerEditorSuggest(new PageLinkAutocompleteSuggester(this.app, this));

        // This adds a simple command that can be triggered anywhere
        this.addCommand({
            id: 'open-sample-modal-simple',
            name: 'Open sample modal (simple)',
            callback: () => {
                //new SampleModal(this.app).open();
            }
        });

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new SampleSettingTab(this.app, this));

        // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
        // Using this function will automatically remove the event listener when this plugin is disabled.
        this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
            //console.log('click', evt);
        });
    }

    onunload() {
        console.log("Unloading plugin: " + pluginName);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Settings for my awesome plugin.' });

        new Setting(containerEl)
            .setName('Setting #1')
            .setDesc('It\'s a secret')
            .addText(text => text
                .setPlaceholder('Enter your secret')
                .setValue(this.plugin.settings.mySetting)
                .onChange(async (value) => {
                    console.log('Secret: ' + value);
                    this.plugin.settings.mySetting = value;
                    await this.plugin.saveSettings();
                }));
    }
}

class PageLinkAutocompleteSuggester extends EditorSuggest<string> {

    constructor(app: App, private thisPlugin: Plugin) {
        super(app);
    }

    addlink(linkArr: string[], myLink: string) {
        if (!linkArr) {
            return true;
        } else {
            if (!linkArr.contains(myLink)) { return true } else { return false }
        }
    }

    onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
        if (cursor.ch === 0) {
            // at beginning of line so exit
            return null;
        } else {
            const curLineStr = editor.getLine(cursor.line);
            const curLineStrMatch = curLineStr.substring(0, cursor.ch);
            const cursorChar = curLineStrMatch.substring(curLineStrMatch.length - 1);
            if (cursorChar !== `;`) {
                return null;
            } else {
                const lastWord = curLineStrMatch.split(" ").last();
                return {
                    start: { line: cursor.line, ch: 0 },
                    end: { line: cursor.line, ch: curLineStr.length - 1 },
                    query: lastWord
                };
            }
        }
    }

    getSuggestions(context: EditorSuggestContext): string[] | Promise<string[]> {
        const queryText = context.query.substring(0, context.query.length - 1);
        console.log(context.query);
        console.log(queryText);
        const mdCache = this.thisPlugin.app.metadataCache.getFileCache(context.file);
        let allLinks: LinkCache[];
        if (mdCache) {
            allLinks = mdCache.links;
        }
        if (allLinks) {
            let myLinks: string[] = [];
            allLinks.forEach(eachLink => {
                if (eachLink.displayText) {
                    if (eachLink.displayText === eachLink.link) {
                        if (this.addlink(myLinks, eachLink.link)) { myLinks.push(eachLink.link) }
                    } else {
                        if (this.addlink(myLinks, eachLink.link)) { myLinks.push(eachLink.link) }
                        if (this.addlink(myLinks, eachLink.displayText)) { myLinks.push(eachLink.displayText) }
                    }
                } else {
                    if (this.addlink(myLinks, eachLink.link)) { myLinks.push(eachLink.link) }
                }
            })
            return myLinks.filter(eachLink => eachLink.toLowerCase().contains(queryText.toLowerCase()));
        } else {
            return null;
        }
    }

    renderSuggestion(value: string, el: HTMLElement) {
        el.setText(value);
    }

    selectSuggestion(value: string, event: MouseEvent | KeyboardEvent) {
        const editor = this.context.editor;
        const cursor = editor.getCursor();
        const curLineStr = editor.getLine(cursor.line);
        const curLineStrMatch = curLineStr.substring(0, cursor.ch);
        const lastWord = curLineStrMatch.split(" ").last();
        const lastWordCh = curLineStrMatch.indexOf(lastWord);
        const newLink = `[[${value}]]`;
        editor.replaceRange(newLink, { line: cursor.line, ch: lastWordCh }, { line: cursor.line, ch: lastWordCh + lastWord.length });
        editor.setSelection({ line: cursor.line, ch: lastWordCh + newLink.length });  // place cursor between tags
    }
}