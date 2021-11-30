import { App, Editor, Plugin, PluginSettingTab, Setting, EditorSuggest, EditorPosition, TFile, EditorSuggestTriggerInfo, EditorSuggestContext, LinkCache, prepareQuery, prepareFuzzySearch, FrontMatterCache, MetadataCache, CachedMetadata } from 'obsidian';
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
    triggerChar: string = ' ';
    useEventListener: boolean = false;
    shiftSpace: boolean = false;
    modRoot: HTMLDivElement = null;

    async onload() {
        console.log("loading plugin: " + pluginName);
        await this.loadSettings();
        //Use event listener like Shift + Space since EditorSuggest can't look at modifier key
        //instead of just regular EditorSuggest looking at last entered character(s)
        this.useEventListener = false;
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
        this.app.workspace.onLayoutReady(this.onLayoutReady.bind(this));
    }

    onLayoutReady(): void {
        if (this.useEventListener) {
            if (document.querySelector("body")) {
                if (this.modRoot === null) { setupEventListeners(this); }
            } else {
                setTimeout(() => {
                    if (document.querySelector("body")) {
                        if (this.modRoot === null) { setupEventListeners(this); }
                    }
                }, 5000);
            }
        }
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

function setupEventListeners(thisPlugin: MyPlugin) {
    console.log('setupEventListeners');
    //Find the main DIV that holds all the markdown panes
    thisPlugin.modRoot = document.querySelector('.workspace-split.mod-vertical.mod-root') as HTMLDivElement;
    thisPlugin.registerDomEvent(thisPlugin.modRoot, 'keydown', (evt: KeyboardEvent) => {
        if (evt.shiftKey && evt.key === ' ') {
            thisPlugin.shiftSpace = true;
            console.log('shift + space');
        } else if (thisPlugin.shiftSpace === true) {
            thisPlugin.shiftSpace = false;
            console.log('setting to false');
        }
    })
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

    constructor(app: App, private thisPlugin: MyPlugin) {
        super(app);
    }

    addlink(linkArr: string[], myLink: string) {
        if (!linkArr) {
            return true;
        } else {
            if (!linkArr.includes(myLink)) { return true } else { return false }
        }
    }

    getLinksFromFile(myFile: TFile): string[] {
        //console.log('getLinksFromFile');
        const mdCache = this.thisPlugin.app.metadataCache.getFileCache(myFile);
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
                        const aliasLink = `${eachLink.link}|${eachLink.displayText}`;
                        if (this.addlink(myLinks, aliasLink)) { myLinks.push(aliasLink) }
                    }
                } else {
                    if (this.addlink(myLinks, eachLink.link)) { myLinks.push(eachLink.link) }
                }
            })
            return myLinks;
        } else {
            return [];
        }
    }

    findLinksRelatedYamlKeyValue(myFile: TFile, mdYaml: FrontMatterCache): string[] {
        //console.log('findLinksRelatedYamlKeyValue');
        const allFiles = this.thisPlugin.app.vault.getMarkdownFiles();
        let yamlFiles: { theFile: TFile, mdCache: CachedMetadata }[] = [];
        allFiles.forEach(eachFile => {
            if (eachFile != myFile) {
                const eachCache = this.thisPlugin.app.metadataCache.getFileCache(eachFile);
                let eachYaml = eachCache ? eachCache.frontmatter : null;
                if (eachYaml) {
                    yamlFiles.push({ theFile: eachFile, mdCache: eachCache });
                }
            }
        });

        let myLinks: string[] = [];
        const yKeys = Object.keys(mdYaml);
        const ignoreKeys = ['position', 'categories', 'tags'];
        yamlFiles.forEach(eachFileYaml => {
            let fileMatch: boolean = false;
            yKeys.forEach(eachKey => {
                if (!ignoreKeys.includes(eachKey)) {
                    const matchingValue = eachFileYaml.mdCache.frontmatter[eachKey];
                    if (matchingValue) {
                        const yamlKey = typeof mdYaml[eachKey] === 'number' ? mdYaml[eachKey].toString() : mdYaml[eachKey];
                        const valArray: Array<string> = typeof yamlKey === 'string' ? [yamlKey] : yamlKey;
                        if (Array.isArray(valArray)) {
                            valArray.forEach(eachVal => {
                                const eachYamlKey = typeof matchingValue === 'number' ? matchingValue.toString() : matchingValue;
                                let valuesArr: Array<string> = [];
                                valuesArr = typeof eachYamlKey === 'string' ? [eachYamlKey] : eachYamlKey;
                                if (Array.isArray(valuesArr)) {
                                    valuesArr.forEach(eachValue => {
                                        if (eachValue.toString().toLowerCase() === eachVal.toString().toLowerCase()) {
                                            if (this.addlink(myLinks, eachFileYaml.theFile.basename)) { myLinks.push(eachFileYaml.theFile.basename) }
                                            fileMatch = true;
                                        }
                                    });
                                }
                            });
                        }
                    }
                }
            });
            if (fileMatch) {
                let myNewLinks: string[] = this.getLinksFromFile(eachFileYaml.theFile);
                myLinks.push(...myNewLinks);
            }
        });
        return myLinks;
    }

    onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
        if (cursor.ch === 0) {
            // at beginning of line so exit
            //console.log('beg of line. Enter key may have been pressed.');
            return null;
        } else {
            const curLineStr = editor.getLine(cursor.line);
            const curLineStrMatch = curLineStr.substring(0, cursor.ch);
            const cursorChar = curLineStrMatch.substring(curLineStrMatch.length - 1);

            let continueProcessing: boolean = false;
            if (this.thisPlugin.useEventListener) {
                if (this.thisPlugin.shiftSpace !== false) { continueProcessing = true }
            } else {
                if (cursorChar === this.thisPlugin.triggerChar || cursorChar === `;`) { continueProcessing = true }
            }

            if (continueProcessing === false) {
                return null;
            } else {
                const lastWord = curLineStrMatch.substring(0, curLineStrMatch.length - 1).split(' ').last();
                if (lastWord.length <= 3 && lastWord !== lastWord.toUpperCase()) { return null }

                /* TESTING FUZZY MATCHING
                const prepQuery = prepareQuery('testing this');
                console.log(prepQuery);
                const prepFuzzySearch = prepareFuzzySearch("testing more");
                console.log(prepFuzzySearch);
                */

                if (cursorChar === `;`) {
                    return {
                        start: { line: cursor.line, ch: curLineStrMatch.length - 1 - lastWord.length },
                        end: { line: cursor.line, ch: curLineStrMatch.length },
                        query: lastWord
                    };
                } else {
                    return {
                        start: { line: cursor.line, ch: curLineStrMatch.length - 1 - lastWord.length },
                        end: { line: cursor.line, ch: curLineStrMatch.length - 1 },
                        query: lastWord
                    };
                }
            }
        }
    }

    getSuggestions(context: EditorSuggestContext): string[] | Promise<string[]> {
        const queryText = context.query;
        /*
        console.log(context);
        console.log(context.query);
        console.log(queryText);
        */
        let allLinks: string[] = [];
        let myLinks: string[] = this.getLinksFromFile(context.file);
        allLinks.push(...myLinks);

        const mdCache: CachedMetadata = this.thisPlugin.app.metadataCache.getFileCache(context.file);
        let mdYaml: FrontMatterCache;
        if (mdCache) {
            mdYaml = mdCache.frontmatter;
        }
        if (mdYaml) {
            myLinks = this.findLinksRelatedYamlKeyValue(context.file, mdYaml);
            allLinks.push(...myLinks);
        }

        let matchingItems = allLinks.filter(eachLink => eachLink.toLowerCase().contains(queryText.toLowerCase()));
        let finalItems: string[] = [];
        matchingItems.forEach(eachItem => {
            if (this.addlink(finalItems, eachItem)) { finalItems.push(eachItem) }
        })
        if (allLinks.length > 0) { return finalItems } else { return null }
    }

    renderSuggestion(value: string, el: HTMLElement) {
        const aliasSplit = value.split('|');
        aliasSplit.length > 1 ? el.setText(aliasSplit[1]) : el.setText(value);
    }

    selectSuggestion(value: string, event: MouseEvent | KeyboardEvent) {
        const editor = this.context.editor;
        const newLink = `[[${value}]]`;
        editor.replaceRange(newLink, this.context.start, this.context.end);
        //editor.setSelection({ line: cursor.line, ch: lastWordCh + newLink.length });
    }
}