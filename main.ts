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
    curMdCacheLinks: LinkCache[];
    fileLinks: string[];
    curYaml: FrontMatterCache;
    yamlLinks: string[];
    vaultLinks: string[];
    linkMode: string;

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

        //When Obsidian initially fully loads
        this.app.workspace.onLayoutReady(this.onLayoutReady.bind(this));

        //Primarily for switching between panes or opening a new file
        this.registerEvent(this.app.workspace.on('file-open', this.onFileChange.bind(this)));

        //Primarily for when switching between Edit and Preview mode
        //this.registerEvent(this.app.workspace.on('layout-change', this.onLayoutChange.bind(this)));

        //Metadatacache updates
        this.registerEvent(
            this.app.metadataCache.on('resolve', (file) => {
                if (this.app.workspace.layoutReady) {
                    //console.log('onMetaChange()');
                    if (this.app.workspace.getActiveFile() != file || this.app.workspace.getActiveFile() === null) return;
                    //console.time('onMetaChange');
                    const mdCache = this.app.metadataCache.getFileCache(file);
                    if (mdCache) {
                        if (mdCache.links) {
                            //Ignoring the check for now because it only takes .1 ms to run so may as well run each time md cache updates
                            //console.time('onMetaChange - AllLinks');
                            this.fileLinks = getLinksFromFile(this, file, mdCache.links);
                            //console.timeEnd('onMetaChange - AllLinks');

                            //Here is the old code when I was checking to have run less often (unnecessary though)
                            /*
                            if (this.curMdCacheLinks.length !== mdCache.links.length) {
                                this.fileLinks = getLinksFromFile(this, file, mdCache.links);
                            }
                            */
                        }
                        if (mdCache.frontmatter) {
                            if (JSON.stringify(this.curYaml) !== JSON.stringify(mdCache.frontmatter)) {
                                //console.time('onMetaChange - frontmatter');
                                this.yamlLinks = findLinksRelatedYamlKeyValue(this, file, mdCache.frontmatter);
                                //console.timeEnd('onMetaChange - frontmatter');
                            }
                        }
                    }
                    //console.timeEnd('onMetaChange');
                }
            })
        );
    }

    onLayoutReady(): void {
        //console.log('onLayoutReady()');
        //console.time('onLayoutReady');
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
        const actFile = this.app.workspace.getActiveFile();
        if (actFile) {
            const mdCache = this.app.metadataCache.getFileCache(actFile);
            this.fileLinks = getLinksFromFile(this, actFile, mdCache.links);
            this.yamlLinks = findLinksRelatedYamlKeyValue(this, actFile, mdCache.frontmatter);
            this.vaultLinks = getAllVaultLinks(this);
        }
        //console.timeEnd('onLayoutReady');
    }

    async onFileChange() {
        this.fileLinks = [];
        this.yamlLinks = [];
        this.vaultLinks = [];
        //console.log('onFileChange()');
        //console.time('onFileChange');
        if (this.app.workspace.layoutReady) {
            const actFile = this.app.workspace.getActiveFile();
            if (actFile) {
                const mdCache = this.app.metadataCache.getFileCache(actFile);
                this.fileLinks = getLinksFromFile(this, actFile, mdCache.links);
                this.yamlLinks = findLinksRelatedYamlKeyValue(this, actFile, mdCache.frontmatter);
                this.vaultLinks = getAllVaultLinks(this);
            }
        }
        //console.timeEnd('onFileChange');
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

    onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
        if (cursor.ch === 0) {
            // at beginning of line so exit
            //console.log('beg of line. Enter key may have been pressed.');
            return null;
        } else {
            if (this.context) { console.log(this.context); }
            let nldActive = false;
            let nldSuggest = false;
            let nldTrigger;
            let nld = (<any>this.thisPlugin.app).plugins.getPlugin('nldates-obsidian');
            if (nld) {
                nldActive = true;
                nldSuggest = nld.settings.isAutosuggestEnabled;
                nldTrigger = nld.settings.autocompleteTriggerPhrase;
            }
            this.thisPlugin.linkMode = 'yaml';
            const curLineStr = editor.getLine(cursor.line);
            if (nldActive && nldSuggest) {
                //This is to avoid interfering with the natural language dates plugin trigger which I am using ",," for
                if (curLineStr.indexOf(nldTrigger) > -1) { return null }
            }
            const curLineStrMatch = curLineStr.substring(0, cursor.ch);
            const cursorChar = curLineStrMatch.substring(curLineStrMatch.length - 1);
            const cursorTwoChar = curLineStrMatch.substring(curLineStrMatch.length - 2);

            let semiAll = false;
            let spaceAll = false;
            let continueProcessing: boolean = false;
            if (this.thisPlugin.useEventListener) {
                if (this.thisPlugin.shiftSpace !== false) { continueProcessing = true }
            } else {
                if (cursorTwoChar === `;,`) { semiAll = true }
                if (cursorTwoChar === `${this.thisPlugin.triggerChar},`) { spaceAll = true }
                if (cursorChar === this.thisPlugin.triggerChar || cursorChar === `;` || semiAll || spaceAll) { continueProcessing = true }
            }

            if (continueProcessing === false) {
                return null;
            } else {
                let lastWord;
                let charsBack = 1;
                if (cursorTwoChar === `;;` || cursorTwoChar === `${this.thisPlugin.triggerChar}${this.thisPlugin.triggerChar}` || semiAll || spaceAll) {
                    charsBack = 2;
                    const splitWords = curLineStrMatch.substring(0, curLineStrMatch.length - 2).split(' ');
                    if (semiAll || spaceAll) {
                        lastWord = splitWords.last();
                    } else {
                        const numWords = splitWords.length;
                        if (numWords <= 1) {
                            lastWord = splitWords[0];
                        } else {
                            lastWord = `${splitWords[numWords - 2]} ${splitWords[numWords - 1]}`;
                        }
                    }
                } else {
                    lastWord = curLineStrMatch.substring(0, curLineStrMatch.length - 1).split(' ').last();
                }

                if (cursorChar === ` `) {
                    if (lastWord.length <= 2) { return null }
                    if (lastWord.length === 3 && lastWord !== lastWord.toUpperCase()) { return null } //For capitalized acronyms
                }

                /* TESTING FUZZY MATCHING
                const prepQuery = prepareQuery('testing this');
                console.log(prepQuery);
                const prepFuzzySearch = prepareFuzzySearch("testing more");
                console.log(prepFuzzySearch);
                */

                if (cursorChar === `;`) {
                    return {
                        start: { line: cursor.line, ch: curLineStrMatch.length - charsBack - lastWord.length },
                        end: { line: cursor.line, ch: curLineStrMatch.length },
                        query: lastWord
                    };
                } else if (semiAll) {
                    this.thisPlugin.linkMode = 'all-semi';
                    return {
                        start: { line: cursor.line, ch: curLineStrMatch.length - charsBack - lastWord.length },
                        end: { line: cursor.line, ch: curLineStrMatch.length },
                        query: lastWord
                    };
                } else if (spaceAll) {
                    this.thisPlugin.linkMode = 'all';
                    return {
                        start: { line: cursor.line, ch: curLineStrMatch.length - charsBack - lastWord.length },
                        end: { line: cursor.line, ch: curLineStrMatch.length },
                        query: lastWord
                    };
                } else {
                    return {
                        start: { line: cursor.line, ch: curLineStrMatch.length - charsBack - lastWord.length },
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
        let allLinks: string[];
        switch (this.thisPlugin.linkMode) {
            case 'yaml':
                allLinks = this.thisPlugin.fileLinks;
                allLinks.push(...this.thisPlugin.yamlLinks);
                break;
            case 'all':
                allLinks = this.thisPlugin.fileLinks;
                allLinks.push(...this.thisPlugin.yamlLinks);
                allLinks.push(...this.thisPlugin.vaultLinks);
                break;
            case 'all-semi':
                allLinks = this.thisPlugin.fileLinks;
                allLinks.push(...this.thisPlugin.yamlLinks);
                allLinks.push(...this.thisPlugin.vaultLinks);
                break;
            default:
                allLinks = this.thisPlugin.fileLinks;
        }

        let matchingItems = allLinks.filter(eachLink => eachLink.toLowerCase().contains(queryText.toLowerCase()));
        let finalItems: string[] = Array.from(new Set(matchingItems)).sort(function (a, b) { return a.length - b.length });
        if (allLinks.length > 0) { return finalItems } else { return null }
    }

    renderSuggestion(value: string, el: HTMLElement) {
        const aliasSplit = value.split('|');
        aliasSplit.length > 1 ? el.setText(aliasSplit[1]) : el.setText(value);
    }

    selectSuggestion(value: string, event: MouseEvent | KeyboardEvent) {
        const editor = this.context.editor;
        let newLink = `[[${value}]]`;
        if (this.thisPlugin.linkMode === 'all') {
            newLink = `[[${value}]] `;
        }
        editor.replaceRange(newLink, this.context.start, this.context.end);
        //editor.setSelection({ line: cursor.line, ch: lastWordCh + newLink.length });
    }
}

function addlink(linkArr: string[], myLink: string): boolean {
    if (!linkArr) {
        return true;
    } else {
        if (!linkArr.includes(myLink)) { return true } else { return false }
    }
}

function getLinksFromFile(thisPlugin: MyPlugin, myFile: TFile, allLinks: LinkCache[] = null): string[] {
    //console.log('getLinksFromFile');
    if (!allLinks) {
        const mdCache = thisPlugin.app.metadataCache.getFileCache(myFile);
        if (mdCache) {
            if (mdCache.links) {
                allLinks = mdCache.links;
            }
        }
    }
    thisPlugin.curMdCacheLinks = allLinks;
    if (allLinks) {
        let myLinks: string[] = [];
        allLinks.forEach(eachLink => {
            if (eachLink.displayText) {
                if (eachLink.displayText === eachLink.link) {
                    if (addlink(myLinks, eachLink.link)) { myLinks.push(eachLink.link) }
                } else {
                    if (addlink(myLinks, eachLink.link)) { myLinks.push(eachLink.link) }
                    const aliasLink = `${eachLink.link}|${eachLink.displayText}`;
                    if (addlink(myLinks, aliasLink)) { myLinks.push(aliasLink) }
                }
            } else {
                if (addlink(myLinks, eachLink.link)) { myLinks.push(eachLink.link) }
            }
        })
        return myLinks;
    } else {
        return [];
    }
}

function findLinksRelatedYamlKeyValue(thisPlugin: MyPlugin, myFile: TFile, mdYaml: FrontMatterCache = null): string[] {
    //console.log('findLinksRelatedYamlKeyValue');
    if (!mdYaml) {
        const mdCache = thisPlugin.app.metadataCache.getFileCache(myFile);
        if (mdCache) {
            if (mdCache.frontmatter) {
                mdYaml = mdCache.frontmatter;
            }
        }
    }
    thisPlugin.curYaml = mdYaml;
    if (mdYaml) {
        const allFiles = thisPlugin.app.vault.getMarkdownFiles();
        let yamlFiles: { theFile: TFile, mdCache: CachedMetadata }[] = [];
        allFiles.forEach(eachFile => {
            if (eachFile != myFile) {
                const eachCache = thisPlugin.app.metadataCache.getFileCache(eachFile);
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
                                            if (addlink(myLinks, eachFileYaml.theFile.basename)) { myLinks.push(eachFileYaml.theFile.basename) }
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
                let myNewLinks: string[] = getLinksFromFile(thisPlugin, eachFileYaml.theFile, eachFileYaml.mdCache.links);
                myLinks.push(...myNewLinks);
            }
        });
        return myLinks;
    } else {
        return []
    }
}

function getAllVaultLinks(thisPlugin: MyPlugin): string[] {
    //console.time('getAllVaultLinks()');
    const files = thisPlugin.app.vault.getMarkdownFiles();
    let links: string[] = [];
    files.forEach((file: TFile) => {
        links.push(file.basename);
    });
    const unResLinks = Object.values(Object.fromEntries(Object.entries(thisPlugin.app.metadataCache.unresolvedLinks)));
    unResLinks.forEach((eachItem) => {
        let theValues = Object.keys(eachItem);
        if (theValues.length > 0) { links.push(...theValues) }
    });
    let uniq: string[] = Array.from(new Set(links));
    //console.timeEnd('getAllVaultLinks()');
    return uniq
}