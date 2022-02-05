import { App, Editor, Plugin, PluginSettingTab, Setting, EditorSuggest, EditorPosition, TFile, EditorSuggestTriggerInfo, EditorSuggestContext, LinkCache, prepareQuery, prepareFuzzySearch, FrontMatterCache, MetadataCache, CachedMetadata } from 'obsidian';
declare module "obsidian" {
    interface WorkspaceLeaf {
        containerEl: HTMLElement;
    }
}
const pluginName = 'Page Link Autocomplete';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
    autoSpace: boolean;
    secondaryTrigger: string;
    getAlias: boolean;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    autoSpace: false,
    secondaryTrigger: ';',
    getAlias: true
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    triggerChar: string = ' ';
    triggerCharSecondary: string = ';';
    triggerCharAllLinks: string = ',';
    useEventListener: boolean = false;
    shiftSpace: boolean = false;
    modRoot: HTMLDivElement = null;
    curMdCacheLinks: LinkCache[];
    fileLinks: string[];
    curYaml: FrontMatterCache;
    yamlLinks: string[];
    yamlKVPairs: Map<any, any>;
    vaultLinks: string[];
    linkMode: string;
    linkMatches: number;
    trigCharMatch: string;

    async onload() {
        console.log("loading plugin: " + pluginName);
        await this.loadSettings();

        if (this.settings.autoSpace) {
            this.triggerChar = ' ';
        } else {
            this.triggerChar = '!null!';
        }
        this.triggerCharSecondary = this.settings.secondaryTrigger;

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
                                let theseResults = findLinksRelatedYamlKeyValue(this, file, mdCache.frontmatter);
                                this.yamlLinks = theseResults.links;
                                this.yamlKVPairs = theseResults.yamlKeyValues;
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
            let theseResults = findLinksRelatedYamlKeyValue(this, actFile, mdCache.frontmatter);
            this.yamlLinks = theseResults.links;
            this.yamlKVPairs = theseResults.yamlKeyValues;
            this.vaultLinks = getAllVaultLinks(this);
        }
        //console.timeEnd('onLayoutReady');
    }

    async onFileChange() {
        this.fileLinks = [];
        this.yamlLinks = [];
        this.yamlKVPairs = new Map();
        this.vaultLinks = [];
        //console.log('onFileChange()');
        //console.time('onFileChange');
        if (this.app.workspace.layoutReady) {
            const actFile = this.app.workspace.getActiveFile();
            if (actFile) {
                const mdCache = this.app.metadataCache.getFileCache(actFile);
                this.fileLinks = getLinksFromFile(this, actFile, mdCache.links);
                let theseResults = findLinksRelatedYamlKeyValue(this, actFile, mdCache.frontmatter);
                this.yamlLinks = theseResults.links;
                this.yamlKVPairs = theseResults.yamlKeyValues;
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
    //console.log('setupEventListeners');
    //Find the main DIV that holds all the markdown panes
    thisPlugin.modRoot = document.querySelector('.workspace-split.mod-vertical.mod-root') as HTMLDivElement;
    thisPlugin.registerDomEvent(thisPlugin.modRoot, 'keydown', (evt: KeyboardEvent) => {
        if (evt.shiftKey && evt.key === ' ') {
            thisPlugin.shiftSpace = true;
            //console.log('shift + space');
        } else if (thisPlugin.shiftSpace === true) {
            thisPlugin.shiftSpace = false;
            //console.log('setting to false');
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
        let { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Page Link Autocomplete Settings' });

        new Setting(containerEl)
            .setName('Auto Suggest Links with Spacebar')
            .setDesc('When enabled this plugin will suggest links after each word you type (if there is a match)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSpace)
                .onChange(async (value) => {
                    this.plugin.settings.autoSpace = value;
                    if (value === true) {
                        this.plugin.triggerChar = ' ';
                    } else {
                        this.plugin.triggerChar = '!null!';
                    }
                    await this.plugin.saveSettings();
                }));

        let thisElem = new Setting(containerEl)
            .setName('Secondary Suggest Trigger')
            .setDesc(createFragment((innerFrag) => {
                innerFrag.createEl('span', { text: 'Character that manually triggers the suggester' });
                innerFrag.createEl('br');
                innerFrag.createEl('strong', { text: 'Note:' });
                innerFrag.createEl('span', { text: ' This can be used in addition to (or in place of) the Spacebar option above' });
            }))
            .addText(text => text
                .setPlaceholder(';')
                .setValue(this.plugin.settings.secondaryTrigger)
                .onChange(async (value) => {
                    this.plugin.settings.secondaryTrigger = value;
                    this.plugin.triggerCharSecondary = value;
                    await this.plugin.saveSettings();
                }));
        thisElem.controlEl.querySelector('input').maxLength = 1;
    }
}

class PageLinkAutocompleteSuggester extends EditorSuggest<string> {

    constructor(app: App, private thisPlugin: MyPlugin) {
        super(app);
    }

    close() {
        this.thisPlugin.trigCharMatch = "";
        this.thisPlugin.linkMode = 'yaml';
        this.thisPlugin.linkMatches = 0;
        // call Obsidian's close method from the class you're extending to close it
        super.close();
    }

    onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
        if (cursor.ch === 0) {
            // at beginning of line so exit
            //console.log('beg of line. Enter key may have been pressed.');
            this.thisPlugin.linkMatches = 0;
            return null;
        } else {
            const cursorChar1 = editor.getRange({ line: cursor.line, ch: cursor.ch - 2 }, cursor);
            if (cursorChar1 === ": ") {
                console.log("matched yaml prop");

                const curLineStr1 = editor.getLine(cursor.line);
                const curLineStrMatch1 = curLineStr1.substring(0, cursor.ch);
                const curLineProp = curLineStr1.substring(0, cursor.ch - 2);
                this.thisPlugin.linkMode = 'yaml-complete';
                let foundValues: string[];
                if (this.thisPlugin.yamlKVPairs) {
                    foundValues = this.thisPlugin.yamlKVPairs.get(curLineProp);
                }
                console.log(foundValues);
                if (foundValues) {
                    this.thisPlugin.yamlLinks = foundValues;
                    console.log(this.thisPlugin.yamlLinks);
                    return {
                        start: { line: cursor.line, ch: curLineStrMatch1.length },
                        end: { line: cursor.line, ch: curLineStrMatch1.length },
                        query: "test"
                    };
                } else {
                    this.thisPlugin.linkMatches = 0;
                    return null;
                }
            } else {
                //If this.context has a value that means the page autocomplete suggester is currently open
                if (this.context && this.thisPlugin.linkMatches > 0) {
                    //This allows the user to filter down the list even more when typing further instead of making it disappear
                    //console.log(this.context);

                    //Remove the "," all links trigger if present so can keep typing and don't have to go remove it manually if you don't select a link to use
                    const origLineStr = editor.getLine(cursor.line);
                    const lastChar = origLineStr.substring(cursor.ch - 1, cursor.ch);

                    let myOffset = 0;
                    if (this.thisPlugin.trigCharMatch === this.thisPlugin.triggerCharSecondary && lastChar === this.thisPlugin.triggerCharAllLinks) {
                        this.thisPlugin.trigCharMatch = `${this.thisPlugin.triggerCharSecondary}${this.thisPlugin.triggerCharAllLinks}`;
                        this.thisPlugin.linkMode = 'all-semi';
                        myOffset = 1;
                    }
                    if (this.thisPlugin.trigCharMatch === this.thisPlugin.triggerChar && lastChar === this.thisPlugin.triggerCharAllLinks) {
                        this.thisPlugin.trigCharMatch = `${this.thisPlugin.triggerChar}${this.thisPlugin.triggerCharAllLinks}`;
                        this.thisPlugin.linkMode = 'all';
                        myOffset = 1;
                    }
                    let startRange: EditorPosition;
                    let endRange: EditorPosition;
                    switch (this.thisPlugin.trigCharMatch) {
                        case this.thisPlugin.triggerCharSecondary:
                            //Don't need to do anything special here
                            break;
                        case `${this.thisPlugin.triggerCharSecondary}${this.thisPlugin.triggerCharAllLinks}`:
                            startRange = { line: cursor.line, ch: cursor.ch - 3 + myOffset };
                            endRange = { line: cursor.line, ch: cursor.ch - 1 + myOffset };
                            if (editor.getRange(startRange, endRange) === `${this.thisPlugin.triggerCharSecondary}${this.thisPlugin.triggerCharAllLinks}`) {
                                editor.replaceRange('', startRange, endRange)
                            }
                            break;
                        case `${this.thisPlugin.triggerChar}`:
                            //Don't need to do anything special here
                            break;
                        case `${this.thisPlugin.triggerChar}${this.thisPlugin.triggerCharAllLinks}`:
                            startRange = { line: cursor.line, ch: cursor.ch - 2 + myOffset };
                            endRange = { line: cursor.line, ch: cursor.ch - 1 + myOffset };
                            if (editor.getRange(startRange, endRange) === this.thisPlugin.triggerCharAllLinks) {
                                editor.replaceRange('', startRange, endRange)
                            }
                            break;
                    }

                    //Need to grab the cursor position again as you may have removed a ';' or ',' for example above
                    const curCursor = editor.getCursor();
                    const curLineStr = editor.getLine(curCursor.line);
                    const newQuery = curLineStr.substring(this.context.start.ch, curCursor.ch);
                    if (newQuery.length < 4) {
                        this.thisPlugin.linkMatches = 0;
                        return null
                    }
                    return {
                        start: { line: this.context.start.line, ch: this.context.start.ch },
                        end: { line: curCursor.line, ch: curCursor.ch - myOffset },
                        query: newQuery
                    };
                } else {
                    const cursorChar = editor.getRange({ line: cursor.line, ch: cursor.ch - 1 }, cursor)
                    if (cursorChar !== this.thisPlugin.triggerChar && cursorChar !== this.thisPlugin.triggerCharSecondary && cursorChar !== this.thisPlugin.triggerCharAllLinks) {
                        this.thisPlugin.linkMatches = 0;
                        return null;
                    }

                    //Check if Natural Language Dates (nld) plugin is enabled and if the auto complete suggester is present, skip
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
                    this.thisPlugin.linkMatches = 0;
                    const curLineStr = editor.getLine(cursor.line);
                    if (nldActive && nldSuggest) {
                        //This is to avoid interfering with the natural language dates plugin trigger which I am using ",," for
                        if (curLineStr.indexOf(nldTrigger) > -1) {
                            this.thisPlugin.linkMatches = 0;
                            return null;
                        }
                    }
                    const curLineStrMatch = curLineStr.substring(0, cursor.ch);
                    const cursorTwoChar = curLineStrMatch.substring(curLineStrMatch.length - 2);

                    let semiAll = false;
                    let spaceAll = false;
                    let continueProcessing: boolean = false;
                    if (this.thisPlugin.useEventListener) {
                        if (this.thisPlugin.shiftSpace !== false) { continueProcessing = true }
                    } else {
                        if (cursorTwoChar === `${this.thisPlugin.triggerCharSecondary}${this.thisPlugin.triggerCharAllLinks}`) { semiAll = true }
                        if (cursorTwoChar === `${this.thisPlugin.triggerChar}${this.thisPlugin.triggerCharAllLinks}`) { spaceAll = true }
                        if (cursorChar === this.thisPlugin.triggerChar || cursorChar === this.thisPlugin.triggerCharSecondary || semiAll || spaceAll) { continueProcessing = true }
                    }

                    if (continueProcessing === false) {
                        this.thisPlugin.linkMatches = 0;
                        return null;
                    } else {
                        let lastWord;
                        let charsBack = 1;
                        if (cursorTwoChar === `${this.thisPlugin.triggerCharSecondary}${this.thisPlugin.triggerCharSecondary}` || cursorTwoChar === `${this.thisPlugin.triggerChar}${this.thisPlugin.triggerChar}` || semiAll || spaceAll) {
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

                        if (lastWord.trim() === "") {
                            this.thisPlugin.linkMatches = 0;
                            return null;
                        }
                        if (cursorChar === this.thisPlugin.triggerChar || cursorChar === this.thisPlugin.triggerCharAllLinks) {
                            if (lastWord.length <= 2) {
                                this.thisPlugin.linkMatches = 0;
                                return null;
                            }
                            if (lastWord.length === 3 && lastWord !== lastWord.toUpperCase()) {
                                this.thisPlugin.linkMatches = 0;
                                return null;
                            } //For capitalized acronyms
                        }

                        /* TESTING FUZZY MATCHING
                        const prepQuery = prepareQuery('testing this');
                        console.log(prepQuery);
                        const prepFuzzySearch = prepareFuzzySearch("testing more");
                        console.log(prepFuzzySearch);
                        */

                        if (cursorChar === this.thisPlugin.triggerCharSecondary) {
                            this.thisPlugin.trigCharMatch = this.thisPlugin.triggerCharSecondary;
                            return {
                                start: { line: cursor.line, ch: curLineStrMatch.length - charsBack - lastWord.length },
                                end: { line: cursor.line, ch: curLineStrMatch.length },
                                query: lastWord
                            };
                        } else if (semiAll) {
                            this.thisPlugin.linkMode = 'all-semi';
                            this.thisPlugin.trigCharMatch = `${this.thisPlugin.triggerCharSecondary}${this.thisPlugin.triggerCharAllLinks}`;
                            return {
                                start: { line: cursor.line, ch: curLineStrMatch.length - charsBack - lastWord.length },
                                end: { line: cursor.line, ch: curLineStrMatch.length },
                                query: lastWord
                            };
                        } else if (spaceAll) {
                            this.thisPlugin.linkMode = 'all';
                            this.thisPlugin.trigCharMatch = `${this.thisPlugin.triggerChar}${this.thisPlugin.triggerCharAllLinks}`;
                            return {
                                start: { line: cursor.line, ch: curLineStrMatch.length - charsBack - lastWord.length },
                                end: { line: cursor.line, ch: curLineStrMatch.length },
                                query: lastWord
                            };
                        } else {
                            this.thisPlugin.trigCharMatch = `${this.thisPlugin.triggerChar}`;
                            return {
                                start: { line: cursor.line, ch: curLineStrMatch.length - charsBack - lastWord.length },
                                end: { line: cursor.line, ch: curLineStrMatch.length },
                                query: lastWord
                            };
                        }
                    }
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
        /*
        console.log(this.thisPlugin.fileLinks)
        console.log(this.thisPlugin.yamlLinks)
        console.log(this.thisPlugin.vaultLinks)
        */
        let allLinks: string[] = [];
        switch (this.thisPlugin.linkMode) {
            case 'yaml':
                allLinks.push(...this.thisPlugin.fileLinks.sort(function (a, b) { return a.length - b.length }));
                allLinks.push(...this.thisPlugin.yamlLinks.sort(function (a, b) { return a.length - b.length }));
                break;
            case 'all':
                allLinks.push(...this.thisPlugin.fileLinks.sort(function (a, b) { return a.length - b.length }));
                allLinks.push(...this.thisPlugin.yamlLinks.sort(function (a, b) { return a.length - b.length }));
                allLinks.push(...this.thisPlugin.vaultLinks.sort(function (a, b) { return a.length - b.length }));
                break;
            case 'all-semi':
                allLinks.push(...this.thisPlugin.fileLinks.sort(function (a, b) { return a.length - b.length }));
                allLinks.push(...this.thisPlugin.yamlLinks.sort(function (a, b) { return a.length - b.length }));
                allLinks.push(...this.thisPlugin.vaultLinks.sort(function (a, b) { return a.length - b.length }));
                break;
            case 'yaml-complete':
                allLinks.push(...this.thisPlugin.yamlLinks.sort(function (a, b) { return a.length - b.length }));
                break;
            default:
                allLinks.push(...this.thisPlugin.fileLinks.sort(function (a, b) { return a.length - b.length }));
        }

        let matchingItems = allLinks.filter(eachLink => eachLink.toLowerCase().contains(queryText.toLowerCase()));
        if (this.thisPlugin.linkMode === 'yaml-complete') {
            matchingItems = allLinks;
        }
        let finalItems: string[] = Array.from(new Set(matchingItems));
        if (finalItems.length > 0) {
            this.thisPlugin.linkMatches = finalItems.length;
            return finalItems
        } else {
            this.thisPlugin.linkMatches = 0;
            return null
        }
    }

    renderSuggestion(value: string, el: HTMLElement) {
        const aliasSplit = value.split('|');
        aliasSplit.length > 1 ? el.setText(aliasSplit[1]) : el.setText(value);
    }

    selectSuggestion(value: string, event: MouseEvent | KeyboardEvent) {
        const editor = this.context.editor;
        let newLink = `[[${value}]]`;
        if (this.thisPlugin.triggerChar === ' ' && (this.thisPlugin.trigCharMatch === `${this.thisPlugin.triggerChar}` || this.thisPlugin.trigCharMatch === `${this.thisPlugin.triggerChar}${this.thisPlugin.triggerCharAllLinks}`)) {
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

function findLinksRelatedYamlKeyValue(thisPlugin: MyPlugin, myFile: TFile, mdYaml: FrontMatterCache = null): { links: string[], yamlKeyValues: Map<any, any> | null} {
    thisPlugin.yamlLinks = [];
    let yamlKVMap = new Map();
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

                    let theKeys = Object.keys(eachYaml);
                    theKeys.forEach(eachKey => {
                        if (eachKey !== "position") {
                            if (eachYaml[eachKey]) {
                                let curMap: string[] = yamlKVMap.get(eachKey);
                                if (curMap) {
                                    curMap.push(eachYaml[eachKey]);
                                } else {
                                    curMap = [eachYaml[eachKey]];
                                }
                                yamlKVMap.set(eachKey, curMap);
                            }
                        }
                    })
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
        console.log(yamlKVMap);
        return { links: myLinks, yamlKeyValues: yamlKVMap };
    } else {
        return { links: [], yamlKeyValues: null }
    }
}

function getAllVaultLinks(thisPlugin: MyPlugin): string[] {
    //On average less than 10ms
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